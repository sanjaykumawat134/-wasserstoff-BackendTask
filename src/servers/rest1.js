// server1.js
import { createServer } from "../common.js";
import dotenv  from "dotenv";
dotenv.config();

const port = process.env.REST_SERVER_1_PORT;
const csvFilePath = "data/sample.csv";

createServer(port, csvFilePath);
