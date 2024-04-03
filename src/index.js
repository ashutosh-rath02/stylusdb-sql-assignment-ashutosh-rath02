const { parseQuery } = require("./queryParser");
const readCSV = require("./csvReader");

function evaluateCondition(row, clause) {
  let { field, operator, value } = clause;

  if (row[field] === undefined) {
    throw new Error(`Invalid field`);
  }
  // Parse row value and condition value based on their actual types
  const rowValue = parsingValue(row[field]);
  let conditionValue = parsingValue(value);
  console.log("rowValue", rowValue);
  console.log("conditionValue", conditionValue);
  // Compare the field value with the condition value
  switch (operator) {
    case "=":
      return rowValue === conditionValue;
    case "!=":
      return rowValue !== conditionValue;
    case ">":
      return rowValue > conditionValue;
    case "<":
      return rowValue < conditionValue;
    case ">=":
      return rowValue >= conditionValue;
    case "<=":
      return rowValue <= conditionValue;
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

function parsingValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (
    typeof value === "string" &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  ) {
    value = value.substring(1, value.length - 1);
  }
  if (!isNaN(value) && value.trim() !== "") {
    return Number(value);
  }
  return value;
}

// Helper functions for different JOIN types
function performInnerJoin(data, joinData, joinCondition, fields, table) {
  return data.flatMap((mainRow) => {
    const matchedJoinRows = joinData.filter((joinRow) => {
      const mainValue = mainRow[joinCondition.left.split(".")[1]];
      const joinValue = joinRow[joinCondition.right.split(".")[1]];
      return mainValue === joinValue;
    });

    // If there are matching rows, create a row for each match
    return matchedJoinRows.map((joinRow) => {
      return fields.reduce((acc, field) => {
        const [tableName, fieldName] = field.split(".");
        acc[field] =
          tableName === table ? mainRow[fieldName] : joinRow[fieldName];
        return acc;
      }, {});
    });
  });
}

function performLeftJoin(data, joinData, joinCondition, fields, table) {
  const leftJoinedData = data.flatMap((mainRow) => {
    const matchedJoinRows = joinData.filter((joinRow) => {
      const mainValue = mainRow[joinCondition.left.split(".")[1]];
      const joinValue = joinRow[joinCondition.right.split(".")[1]];
      return mainValue === joinValue;
    });

    if (matchedJoinRows.length === 0) {
      return [createResultRow(mainRow, null, fields, table, true)];
    }
    return matchedJoinRows.map((joinRow) =>
      createResultRow(mainRow, joinRow, fields, table, true)
    );
  });
  return leftJoinedData;
}

function createResultRow(
  mainRow,
  joinRow,
  fields,
  table,
  includeAllMainFields
) {
  const resultRow = {};
  if (includeAllMainFields) {
    // Include all fields from the main table
    Object.keys(mainRow || {}).forEach((key) => {
      const prefixedKey = `${table}.${key}`;
      resultRow[prefixedKey] = mainRow ? mainRow[key] : null;
    });
  }
  // Now, add or overwrite with the fields specified in the query
  fields.forEach((field) => {
    const [tableName, fieldName] = field.includes(".")
      ? field.split(".")
      : [table, field];
    resultRow[field] =
      tableName === table && mainRow
        ? mainRow[fieldName]
        : joinRow
        ? joinRow[fieldName]
        : null;
  });
  return resultRow;
}

async function executeSELECTQuery(query) {
  const {
    fields,
    table,
    whereClauses,
    joinType,
    joinTable,
    joinCondition,
    groupByFields,
    hasAggregateWithoutGroupBy,
    orderByFields,
  } = parseQuery(query);

  let data = await readCSV(`${table}.csv`);
  console.log("data before join condition", data);
  // LOGIC for applying the joins
  console.log("groupByfieds", groupByFields);
  if (joinTable && joinCondition) {
    const joinData = await readCSV(`${joinTable}.csv`);
    switch (joinType.toUpperCase()) {
      case "INNER":
        data = performInnerJoin(data, joinData, joinCondition, fields, table);
        break;
      case "LEFT":
        data = performLeftJoin(data, joinData, joinCondition, fields, table);
        break;
      case "RIGHT":
        data = performRightJoin(data, joinData, joinCondition, fields, table);
        break;
      default:
        throw new Error(`Unsupported join type`);
      // Handle default case or unsupported JOIN types
    }
  }

  console.log("data", data);
  let filteredData =
    whereClauses.length > 0
      ? data.filter((row) =>
          whereClauses.every((clause) => evaluateCondition(row, clause))
        )
      : data;
  console.log("filtered Data after condition", filteredData);

  let groupData = filteredData;
  if (hasAggregateWithoutGroupBy) {
    // handling queries where there are no Group by and we are doing Aggregrate
    const output = {};

    fields.forEach((field) => {
      const match = /(\w+)\((\*|\w+)\)/.exec(field);
      if (match) {
        const [, aggregrateFunc, aggregrateField] = match;
        switch (aggregrateFunc.toUpperCase()) {
          case "COUNT":
            output[field] = filteredData.length;
            break;
          case "SUM":
            output[field] = filteredData.reduce(
              (acc, row) => acc + parseFloat(row[aggregrateField]),
              0
            );
            break;
          case "AVG":
            output[field] =
              filteredData.reduce(
                (acc, row) => acc + parseFloat(row[aggregrateField]),
                0
              ) / filteredData.length;
            break;
          case "MIN":
            output[field] = Math.min(
              ...filteredData.map((row) => parseFloat(row[aggregrateField]))
            );
            break;
          case "MAX":
            output[field] = Math.max(
              ...filteredData.map((row) => parseFloat(row[aggregrateField]))
            );
            break;
          // Additional aggregate functions can be handled here
        }
      }
    });

    return [output];
  } else if (groupByFields) {
    groupData = applyGroupBy(filteredData, groupByFields, fields);
    console.log("Group dataa", groupData);

    let orderOutput = groupData;
    if (orderByFields) {
      orderOutput = groupData.sort((a, b) => {
        for (let { fieldName, order } of orderByFields) {
          if (a[fieldName] < b[fieldName]) return order === "ASC" ? -1 : 1;
          if (a[fieldName] > b[fieldName]) return order === "ASC" ? 1 : -1;
        }
        return 0;
      });
    }
    return groupData;
  } else {
    // Order them by the specified fields
    let orderOutput = groupData;
    if (orderByFields) {
      orderOutput = groupData.sort((a, b) => {
        for (let { fieldName, order } of orderByFields) {
          if (a[fieldName] < b[fieldName]) return order === "ASC" ? -1 : 1;
          if (a[fieldName] > b[fieldName]) return order === "ASC" ? 1 : -1;
        }
        return 0;
      });
    }

    return orderOutput.map((row) => {
      const selectedRow = {};
      fields.forEach((field) => {
        selectedRow[field] = row[field];
      });
      return selectedRow;
    });
  }
}
function performRightJoin(data, joinData, joinCondition, fields, table) {
  // Cache the structure of a main table row (keys only)
  console.log("Inside Right join");
  console.log("data", data);
  console.log("Joindata", joinData);
  console.log("JoinCodnitio", joinCondition);
  console.log("fields", fields);
  const RowStructure =
    data.length > 0
      ? Object.keys(data[0]).reduce((acc, key) => {
          acc[key] = null; // Set all values to null initially
          return acc;
        }, {})
      : {};
  let rightJoinedData = joinData.map((joinRow) => {
    const mainRowMatch = data.find((mainRow) => {
      const mainValue = getValueFromGivenRow(mainRow, joinCondition.left);
      const joinValue = getValueFromGivenRow(joinRow, joinCondition.right);
      return mainValue === joinValue;
    });
    // Use the cached structure if no match is found
    const mainRowToUse = mainRowMatch || RowStructure;
    // Include all necessary fields from the 'student' table
    return createResultRow(mainRowToUse, joinRow, fields, table, true);
  });
  console.log("rightJOinedDAta", rightJoinedData);
  return rightJoinedData;
}

function getValueFromGivenRow(row, compoundFieldName) {
  const [tableName, fieldName] = compoundFieldName.split(".");
  return row[`${tableName}.${fieldName}`] || row[fieldName];
}

function applyGroupBy(data, groupByFields, aggregateFunctions) {
  const groupResult = {};
  data.forEach((row) => {
    // Generate a key for the group
    const Key = groupByFields.map((field) => row[field]).join("-");
    // Initialize group in results if it doesn't exist
    if (!groupResult[Key]) {
      groupResult[Key] = { count: 0, sums: {}, mins: {}, maxes: {} };
      groupByFields.forEach((field) => (groupResult[Key][field] = row[field]));
    }
    // Aggregate calculations
    groupResult[Key].count += 1;
    aggregateFunctions.forEach((func) => {
      const match = /(\w+)\((\w+)\)/.exec(func);
      if (match) {
        const [, aggregateFunc, aggregateField] = match;
        const value = parseFloat(row[aggregateField]);
        switch (aggregateFunc.toUpperCase()) {
          case "SUM":
            groupResult[Key].sums[aggregateField] =
              (groupResult[Key].sums[aggregateField] || 0) + value;
            break;
          case "MIN":
            groupResult[Key].mins[aggregateField] = Math.min(
              groupResult[Key].mins[aggregateField] || value,
              value
            );
            break;
          case "MAX":
            groupResult[Key].maxes[aggregateField] = Math.max(
              groupResult[Key].maxes[aggregateField] || value,
              value
            );
            break;
          // Additional aggregate functions can be added here
        }
      }
    });
  });
  // Convert grouped results into an array format
  return Object.values(groupResult).map((group) => {
    // Construct the final grouped object based on required fields
    const finalGroup = {};
    groupByFields.forEach((field) => (finalGroup[field] = group[field]));
    aggregateFunctions.forEach((func) => {
      const match = /(\w+)\((\*|\w+)\)/.exec(func);
      if (match) {
        const [, aggregateFunc, aggregateField] = match;
        switch (aggregateFunc.toUpperCase()) {
          case "SUM":
            finalGroup[func] = group.sums[aggregateField];
            break;
          case "MIN":
            finalGroup[func] = group.mins[aggregateField];
            break;
          case "MAX":
            finalGroup[func] = group.maxes[aggregateField];
            break;
          case "COUNT":
            finalGroup[func] = group.count;
            break;
          // Additional aggregate functions can be handled here
        }
      }
    });
    return finalGroup;
  });
}

const query1 = `SELECT name FROM student ORDER BY name ASC`;
const ret = executeSELECTQuery(query1);

module.exports = executeSELECTQuery;
