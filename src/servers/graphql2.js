// server5.js
import { createGraphqlServer } from "../common.js";
import dotenv  from "dotenv";
dotenv.config();

const port = process.env.GRAPHQL_SERVER_2_PORT;

createGraphqlServer(port);
