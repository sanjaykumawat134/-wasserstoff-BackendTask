import express, { request } from "express";
import httpProxy from "http-proxy-middleware";
import axios from "axios";
import { createObjectCsvWriter } from "csv-writer";
import morgan from "morgan";
import bodyParser from "body-parser";
import dotenv  from "dotenv";
import cron from "node-cron";
import { healthCheck } from "./common.js";
dotenv.config();

const serverConfigurations = [
  {
    rest: [
      { port: 5073, weight: 2 },
      { port: 5173, weight: 1 },
      { port: 5273, weight: 2 },
      { port: 5373, weight: 1 },
    ],
  },
  {
    graphql: [
      { port: 5473, weight: 2 },
      { port: 5573, weight: 1 },
      { port: 5673, weight: 2 },
    ],
  },
  {
    grpc: [
      { port: 5773, weight: 1 },
      { port: 5873, weight: 2 },
      { port: 5973, weight: 1 },
    ],
  },
];

const app = express();
const port = process.env.LOAD_BALANCER_PORT;
app.use(morgan("dev"));

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())
// Create a CSV writer to log requests
const csvWriter = createObjectCsvWriter({
  path: "request_logs.csv",
  header: [
    { id: "timestamp", title: "Timestamp" },
    { id: "ip", title: "IP Address" },
    { id: "serverPort", title: "Server Port" },
    { id: "originalUrl", title: "Original URL" },
    { id: "endpointSelection", title: "endpoint Selection" },
  ],
});

let algorithm = process.env.ROUTING_ALGORITHM || "FIFO";
// Queues for different strategies
let fifoQueue = [];

// Middleware to log request time 
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const endTime = Date.now();
    const elapsedTime = endTime - startTime;
    console.log(`Request to ${req.method} ${req.url} took ${elapsedTime} ms`);
  });
  next();
});

// Middleware to randomly select a server using Weighted Round Robin algorithm
app.use((req, res, next) => {
  // determine api type and based on api type select the appropriate server
  let apiType = determineApiType(req);
   // custom critearea i.e suppose we have server preference based on X-Server-Preference
   const serverPreference = req.header('X-Server-Preference');
   let selectedServer;
   const startTime  = Date.now(); 
   if(serverPreference){
         selectedServer = selectServer(serverConfigurations, apiType ,serverPreference);
         if(!selectedServer) {
           res.status(400).json({ error: `Unsupported server preference: ${serverPreference}` });
           return;
         }
   }else {
    selectedServer = selectServer(serverConfigurations, apiType);
   }
   const endTime = Date.now();
   let elapsedTime = endTime - startTime;
   req.selectedServer = selectedServer;
  // Log the request information to CSV
  const logData = {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    serverPort: selectedServer ? selectedServer.port : "N/A",
    originalUrl: req.originalUrl,
    endpointSelection : `${elapsedTime} ms`
  };
  csvWriter.writeRecords([logData]);
  if (selectedServer) {
    if( algorithm =="FIFO" || "PRIORITY"){
      fifoQueue.push({req, res, apiType});
     processQueue();
    }else {

      proxyRequest(req, res, apiType);
    }
  } else {
    res.status(503).send("Service Unavailable");
  }
});


// Proxy middleware for the selected server
const selectedServerProxy = httpProxy.createProxyMiddleware({
  target: "http://localhost", // Set the target to the base URL of your servers
  changeOrigin: true,
});

// Use the proxy middleware for all routes
app.use("/", selectedServerProxy);

app.listen(port, () => {
  console.log(`Load Balancer listening at http://localhost:${port}`);
});

// Function to select a server using Weighted Round Robin
function selectServer(serverConfigurations, apiType ,serverPreference) {
  // Find the server configuration based on apiType
  const config = serverConfigurations.find((config) =>
    config.hasOwnProperty(apiType.toLowerCase())
  );
  if (!config) {
    throw new Error(`Server configuration not found for API type: ${apiType}`);
  }

  // Extract servers and the iweights based on apiType
  const servers = config[apiType.toLowerCase()];
  if (!servers || servers.length === 0) {
    throw new Error(`No servers configured for API type: ${apiType}`);
  }
  if(serverPreference){
    if (serverPreference === 'server1') {
       return servers[0];
  } else if (serverPreference === 'server2') {
    return servers[1];
    } else if (serverPreference === 'server3') {
      return servers[2];
    } else {
      return null;
  }
  }else {
    if(algorithm == "ROUND_ROBIN"){
      let currentWeightIndex =0;
      console.log("currentWeightIndex >>>",currentWeightIndex)
      while (true) {
        const totalWeight = servers.reduce((acc, config) => acc + config.weight, 0);
        const randomNum = Math.floor(Math.random() * totalWeight);
        let weightSum = 0;
    
        for (let i = currentWeightIndex; i < servers.length; i++) {
          const config = servers[i];
          weightSum += config.weight;
    
          if (randomNum < weightSum) {
            currentWeightIndex = (i + 1) % servers.length; // Update index for the next round
            console.log("currentWeightIndex end >>>",currentWeightIndex)
            return config;
          }
        }
        currentWeightIndex = 0;
      }
      // first in first out
    }else if(algorithm =="FIFO" || "PRIORITY") {
        // Generate a random index to select a server from the `servers` array
        const randomIndex = Math.floor(Math.random() * servers.length);
        return servers[randomIndex];
    }
   
  }

  
}

// Function to proxy the request to the selected server
function proxyRequest(req, res, apiType) {
  const selectedServer = req.selectedServer;
  const selectedPort = selectedServer.port;
  const originalUrl = req.originalUrl; // Store original URL
  let url = `http://localhost:${selectedPort}${originalUrl}`;
  console.log(url);
  switch (apiType) {
    case "REST": {
      axios({
        url,
        method: request.method,
        headers: request.headers,
        params: request.params,
        data: request.method == "GET" ? null : request.body,
      })
        .then((serverResponse) => {
          const responseData = serverResponse.data; // Get response data from server
          // Send response data to client
          res.send(responseData);
        })
        .catch((error) => {
          console.error(`Error forwarding request to server: ${error}`);
          res.status(500).send("Internal Server Error");
        });
      break;
    }
    case "GraphQL": {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }
      console.log("req.body", req.body);
      axios
        .post(url, req.body, {
          headers: {
            "content-type": "application/json",
          },
        })
        .then((serverResponse) => {
          const responseData = serverResponse.data; // Get response data from server
          // Send response data to client
          res.send(responseData);
        })
        .catch((error) => {
          console.error(`Error forwarding request to server: ${error}`);
          res.status(500).send("Internal Server Error");
        });
      break;
    }

    default:
      break;
  }
}
// Function to determine the api type
function determineApiType(req) {
  // Check path or specific query parameters if applicable
  const path = req.path;

  // Default API type if no specific criteria match
  let apiType = "REST"; // Default to REST API

  // Logic to determine API type based on various conditions
  if (path.startsWith("/graphql")) {
    apiType = "GraphQL";
  } else if (path.startsWith("/api/grpc")) {
    apiType = "gRPC";
  }

  return apiType;
}

// queued request and process them one by one
const  processQueue = async ()=>{
  return new Promise((resolve ,reject)=>{
    setTimeout(() => {
      let  {req, res, apiType} = fifoQueue.shift();
  resolve(proxyRequest(req, res, apiType))
    }, 100);
  })
 
}
// Flatten the serverConfigurations array
const flatConfigurations = serverConfigurations
  .flatMap((config) =>
    Object.entries(config).flatMap(([endpointType, servers]) =>
      servers.map(({ port, weight }) => ({ endpointType, port, weight }))
    )
  )
  .map((item) => `http://localhost:${item.port}`);
cron.schedule(`*/5 * * * * *`, () => {
// console.log(flatConfigurations);
  healthCheck(5, flatConfigurations);
});