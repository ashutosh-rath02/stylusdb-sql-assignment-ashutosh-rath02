const fs = require("fs");
const csv = require("csv-parser");

function readCSV(filePath) {
  const results = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => {
        resolve(results);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

async function writeCSV(filePath, data) {
  if (!Array.isArray(data)) {
    throw new Error("Input data must be an array of objects");
  }

  const headers = Object.keys(data[0]);

  let csvContent = "";

  csvContent += headers.join(",") + "\n";

  for (const row of data) {
    csvContent += Object.values(row).join(",") + "\n";
  }

  try {
    await fs.writeFile(filePath, csvContent, (err) => {
      if (err) {
        throw err;
      } else {
      }
    });
  } catch (error) {
    console.error(`Error writing CSV file: ${error.message}`);
  }
}

module.exports = { readCSV, writeCSV };
