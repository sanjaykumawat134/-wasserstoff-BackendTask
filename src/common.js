// common.js
import express from "express";
import csv from "csvtojson";
import {graphqlHTTP} from "express-graphql";
import graphql from "graphql";
import bodyParser from "body-parser";
const itemsPerPage = 100;
let healthyServers  =[];
import winston from "winston";
import axios from "axios";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "user-service" },
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

// rest server
function createServer(port, csvFilePath) {
  const app = express();

  // parse application/x-www-form-urlencoded
  app.use(bodyParser.urlencoded({ extended: false }));

  // parse application/json
  app.use(bodyParser.json());
  // this results in a faster response
  app.get("/", (req, res) => {
    res.json({
      server: `[Load Balancer] Server listening on port ${port}`,
      message:
        "Welcome to the Load Balancer! Please use the /api endpoint to access the data.",
    });
  });
  // this api processes a csv file will result in slower response
  app.get("/api", async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    console.log(`Page ${page} requested`);

    try {
      const csvRows = await csv({
        noheader: true,
        output: "csv",
      }).fromFile(csvFilePath);

      if (!csvRows || csvRows.length === 0) {
        return res
          .status(404)
          .json({ error: "CSV file is empty or not found." });
      }

      const headers = getHeaders(csvRows[0]);

      // Convert CSV rows to JSON format including headers
      const json = csvRows.slice(1).map((row) => {
        const item = {};
        for (let j = 0; j < headers.length; j++) {
          item[headers[j].toLowerCase()] = row[j];
        }
        return item;
      });

      // Paginate the JSON array
      const startIndex = (page - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedJson = json.slice(startIndex, endIndex);

      res.setHeader("Content-Type", "application/json");
      res.json({
        server: `[Load Balancer] Server listening on port ${port}`,
        page,
        itemsPerPage,
        total: json.length,
        totalPages: Math.ceil(json.length / itemsPerPage),
        data: paginatedJson,
      });
    } catch (error) {
      console.error("Error reading CSV:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Process PID: ${process.pid}`);
    healthyServers.push(`http://localhost:${port}`)
  });
}


// Sample data (simulating a list of records)
const records = [
  { id: '1', name: 'Record 1' },
  { id: '2', name: 'Record 2' },
  { id: '3', name: 'Record 3' },
  { id: '4', name: 'Record 4' },
  { id: '5', name: 'Record 5' }
];

// GraphQL object type for Record
const RecordType = new graphql.GraphQLObjectType({
  name: "Record",
  fields: () => ({
    id: { type: graphql.GraphQLID },
    name: { type: graphql.GraphQLString }
  })
});

// GraphQL query type (Root Query)
const QueryRoot = new graphql.GraphQLObjectType({
  name: "Query",
  fields: () => ({
    records: {
      type: graphql.GraphQLList(RecordType),
      resolve: () => records // Resolve function returns the list of records
    }
  }),
});

// GraphQL schema
const schema = new graphql.GraphQLSchema({ query: QueryRoot });

function createGraphqlServer(port) {
  // graphql server code here
  const app = express();
  // parse application/x-www-form-urlencoded
  app.use(bodyParser.urlencoded({ extended: false }));
  // parse application/json
  app.use(bodyParser.json());
  app.use(
    "/graphql/",
    graphqlHTTP({
      schema: schema,
      graphiql: true,
    })
  );
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Process PID: ${process.pid}`);
    healthyServers.push(`http://localhost:${port}`)
  });
}
function getHeaders(firstRow) {
  // Check if the first row looks like valid identifiers
  return firstRow.map((header) => header.trim());
}
let current ;
const healthCheck = async (healthCheckPeriod , servers) => {
  try {
    console.log(`----- Health check run at every ${healthCheckPeriod} seconds -----`);
    for (let i = 0; i < servers.length; i++) {
      const curr = servers[i];
      console.log(`current`,curr)
      try {
        const res = await axios.get(`${curr}`);

        const index = healthyServers.indexOf(curr);
        if (index < 0) healthyServers.push(curr);
      } catch (error) {
        console.log(error.message, !error.response);
                      if (!error.response) {
                       healthyServers = healthyServers.filter((item)=>item!==curr)
                      }else {
                              const index = healthyServers.indexOf(curr);
                              if (index < 0) healthyServers.push(curr);
                      }
              
        logger.error(
          `healthCheckError - > errorMessage: ${error.message}`
        );
      }
    }

    const healthyServersCount = healthyServers.length ;
    const deadServersCount = servers.length - healthyServers.length;
    console.log("healthyServers", healthyServers);
    console.log(`----- total healthly servers running ${healthyServersCount}, total dead servers ${deadServersCount}`);
  
  } catch (error) {
    console.log(error);
  }
};
export { createServer, createGraphqlServer , healthCheck };
