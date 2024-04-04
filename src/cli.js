#!/usr/bin/env node

const readline = require("readline");
const {
  executeSELECTQuery,
  executeINSERTQuery,
  executeDELETEQuery,
} = require("./index");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.setPrompt("SQL> ");
console.log(
  'SQL Query Engine CLI. Enter your SQL commands, or type "exit" to quit.'
);

rl.prompt();

rl.on("line", async (line) => {
  if (line.toLowerCase() === "exit") {
    rl.close();
    return;
  }

  try {
    const queryType = line.split(" ")[0].toUpperCase();
    switch (queryType) {
      case "SELECT":
        const results = await executeSELECTQuery(line);
        console.log(results);
        break;
      case "INSERT":
        const rowsAffected = await executeINSERTQuery(line);
        console.log(`Rows inserted: ${rowsAffected}`);
        break;
      case "DELETE":
        const deletedRows = await executeDELETEQuery(line);
        console.log(`Rows deleted: ${deletedRows}`);
        break;
      default:
        console.error("Invalid query type");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }

  rl.prompt();
}).on("close", () => {
  console.log("Exiting SQL CLI");
  process.exit(0);
});
