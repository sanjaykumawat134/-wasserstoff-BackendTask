
# Nodejs load balancer 

Express.js-based load balancer that distribute incoming requests across multiple servers using routing algorithms.


### overview
I have created 10 servers (4 rest , 3 graphql , 3 grpc servers) ,
created them in individual files so that they can be registered as pm2 process individual.
and a master load balancer , which will pick a server from list of connected servers  , and route request to the server based on api types , and custom critearea.

- Rest server routes.
   - "/"  - root route for rest 
   - "/api" - a relatively slow route process csv and returns      paginated data.
- Graphql server route.
   - "/graphql/"   - root route for graphql server.
   - "/graphql/api" - a relatively slow route returns sample graphql data.

- custom critearea 
    - I have defined a custom header named "X-Server-Preference" 
      which has string values "server 1 , server 2 , server 3".
      which means these servers will be given preference in the  list of servers.


### prerequisite 
- Node.js
- npm
- Python 3
- npx
- pm2

### Installation
1. install nodejs .
2. install pm2 and nodemon
 ```bash
 npm install pm2 nodemon --global
```
1. Clone the repository
```bash
git clone 
```
2. Change directory
```bash
cd node-loadbalancer
```
3. Install dependencies
```bash
npm install
```
4. Start the servers
```bash
npm run start
```
5. Start the load balancer
```bash
npm run start:balancer
```
6. Test the load balancer
> You can access the load balancer at `http://localhost:8000` health check route and `http://localhost:8000/api` for the API route.

To test the load balancer, you can use the following command:
```bash
# Health check route
npm run test:load:health 

# API route
npm run test:load:api
```
This will send 1200 requests to the load balancer and 400 concurrent requests at a time.

## Logging
Requests and their details, such as timestamp, IP address, server port, and original URL, are logged to a CSV file (`request_logs.csv`).

You can analyze the log file using the run the following command:
```bash
npm run analyze
```
The script generates a report and visualizations, including bar charts for the distribution of requests between server ports.