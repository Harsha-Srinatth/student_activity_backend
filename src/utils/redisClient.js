import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();

const client = createClient({
  tls:true,
  url: process.env.REDIS_URL, // uses TLS automatically (rediss://)
});

client.on("error", (err) => console.error("Redis Error:", err));

await client.connect(); // connect once at startup

export default client;