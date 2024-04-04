const {
  parseSelectQuery,
  parseInsertQuery,
  parseDeleteQuery,
} = require("./queryParser");
const { readCSV, writeCSV } = require("./csvReader");

async function performInnerJoin(data, joinData, joinCondition, fields, table) {
  return (data = data.flatMap((mainRow) => {
    return joinData
      .filter((joinRow) => {
        const mainValue = mainRow[joinCondition.left.split(".")[1]];
        const joinValue = joinRow[joinCondition.right.split(".")[1]];
        return mainValue === joinValue;
      })
      .map((joinRow) => {
        let output = {};
        for (const key in mainRow) {
          output[table + "." + key] = mainRow[key];
        }
        for (const key in joinRow) {
          output[joinCondition.right.split(".")[0] + "." + key] = joinRow[key];
        }
        const filteredOutput = {};
        fields.forEach((field) => {
          const [tableName, fieldName] = field.split(".");
          filteredOutput[field] =
            tableName === table ? mainRow[fieldName] : joinRow[fieldName];
        });
        return { ...output, ...filteredOutput };
      });
  }));
}

async function performLeftJoin(data, joinData, joinCondition, fields, table) {
  return (data = data.flatMap((mainRow) => {
    const matchingJoinRows = joinData.filter((joinRow) => {
      const mainValue = mainRow[joinCondition.left.split(".")[1]];
      const joinValue = joinRow[joinCondition.right.split(".")[1]];
      return mainValue === joinValue;
    });

    if (matchingJoinRows.length === 0) {
      let output = {};
      for (const key in mainRow) {
        output[table + "." + key] = mainRow[key];
      }
      const filteredOutput = {};
      fields.forEach((field) => {
        const [tableName, fieldName] = field.split(".");
        filteredOutput[field] = tableName === table ? mainRow[fieldName] : null;
      });
      return { ...output, ...filteredOutput };
    }

    return matchingJoinRows.map((joinRow) => {
      let output = {};
      for (const key in mainRow) {
        output[table + "." + key] = mainRow[key];
      }
      for (const key in joinRow) {
        output[joinCondition.right.split(".")[0] + "." + key] = joinRow[key];
      }
      const filteredOutput = {};
      fields.forEach((field) => {
        const [tableName, fieldName] = field.split(".");
        filteredOutput[field] =
          tableName === table ? mainRow[fieldName] : joinRow[fieldName];
      });
      return { ...output, ...filteredOutput };
    });
  }));
}

async function executeSELECTQuery(query) {
  try {
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
      limit,
      isDistinct,
    } = parseSelectQuery(query);
    let data = await readCSV(`${table}.csv`);

    if (joinTable && joinCondition) {
      const joinData = await readCSV(`${joinTable}.csv`);

      switch (joinType.toUpperCase()) {
        case "INNER":
          data = await performInnerJoin(
            data,
            joinData,
            joinCondition,
            fields,
            table
          );
          break;
        case "LEFT":
          data = await performLeftJoin(
            data,
            joinData,
            joinCondition,
            fields,
            table
          );
          break;
        case "RIGHT":
          data = await performRightJoin(
            data,
            joinData,
            joinCondition,
            fields,
            table
          );
          break;
      }
    }

    const filterData = () => {
      if (whereClauses.length > 0) {
        return data.filter((row) => {
          return whereClauses.every((clause) => {
            return evaluateCondition(row, clause);
          });
        });
      } else {
        return data;
      }
    };
    let filteredData;
    filteredData = filterData();
    if (limit !== null) {
      filteredData = filteredData.slice(0, limit);
    }
    if (groupByFields || hasAggregateWithoutGroupBy) {
      const aggregateFields = fields
        .map((field) => {
          if (field.includes("as")) {
            const temp = field.split();
            let aggField = getAggregateFields(temp[0]);
            aggField["as"] = field;
            return aggField;
          } else {
            return getAggregateFields(field);
          }
        })
        .filter((field) => field != undefined);
      filteredData = applyGroupBy(
        filteredData,
        groupByFields,
        aggregateFields,
        hasAggregateWithoutGroupBy
      );
    }
    if (orderByFields) {
      filteredData.sort((a, b) => {
        for (let { fieldName, order } of orderByFields) {
          if (a[fieldName] < b[fieldName]) return order === "ASC" ? -1 : 1;
          if (a[fieldName] > b[fieldName]) return order === "ASC" ? 1 : -1;
        }
        return 0;
      });
    }

    try {
      if (fields[0] !== "*") {
        filteredData = filteredData.map((row) => {
          const selectedRow = {};
          fields.forEach((field) => {
            selectedRow[field] = row[field];
          });
          return selectedRow;
        });
      }
    } catch (err) {
      throw new Error(
        "Fields in query doesn't match the fields in filtered data"
      );
    }
    if (isDistinct) {
      filteredData = [
        ...new Map(
          filteredData.map((item) => [
            fields.map((field) => item[field]).join("|"),
            item,
          ])
        ).values(),
      ];
    }
    return filteredData;
  } catch (error) {
    throw new Error(`Error executing query: ${error.message}`);
  }
}

async function performRightJoin(data, joinData, joinCondition, fields, table) {
  return (joinData = joinData.flatMap((joinRow) => {
    const matchingDataRows = data.filter((mainRow) => {
      const mainValue = mainRow[joinCondition.left.split(".")[1]];
      const joinValue = joinRow[joinCondition.right.split(".")[1]];
      return mainValue === joinValue;
    });

    if (matchingDataRows.length === 0) {
      let output = {};
      for (const key in joinRow) {
        output[joinCondition.right.split(".")[0] + "." + key] = joinRow[key];
      }
      const filteredOutput = {};
      fields.forEach((field) => {
        const [tableName, fieldName] = field.split(".");
        filteredOutput[field] = tableName === table ? null : joinRow[fieldName];
      });
      return { ...output, ...filteredOutput };
    }

    return matchingDataRows.map((mainRow) => {
      let output = {};
      for (const key in mainRow) {
        output[table + "." + key] = mainRow[key];
      }
      for (const key in joinRow) {
        output[joinCondition.right.split(".")[0] + "." + key] = joinRow[key];
      }
      const filteredOutput = {};
      fields.forEach((field) => {
        const [tableName, fieldName] = field.split(".");
        filteredOutput[field] =
          tableName === table ? mainRow[fieldName] : joinRow[fieldName];
      });
      return { ...output, ...filteredOutput };
    });
  }));
}
function getAggregateFields(field) {
  const match = field.match(/^(AVG|SUM|COUNT|MIN|MAX)\((.+)\)/i);
  if (match) {
    return { function: match[1].trim(), on: match[2].trim(), as: null };
  }
}

function applyGroupBy(
  data,
  groupByFields,
  aggregateFields,
  hasAggregateWithoutGroupBy
) {
  if (!aggregateFields.length) {
    return data;
  }
  if (!groupByFields && hasAggregateWithoutGroupBy) {
    const aggregatedValues = {};
    aggregateFields.forEach((field) => {
      const { function: aggFunction, on: fieldToAggregate } = field;
      switch (aggFunction.toUpperCase()) {
        case "COUNT":
          aggregatedValues[aggFunction + "(" + fieldToAggregate + ")"] =
            data.length;

          break;
        case "SUM":
          const sumin = data.reduce(
            (acc, row) => acc + Number(row[fieldToAggregate]),
            0
          );
          aggregatedValues[aggFunction + "(" + fieldToAggregate + ")"] = sumin;
          break;
        case "MIN":
          aggregatedValues[aggFunction + "(" + fieldToAggregate + ")"] =
            Math.min(...data.map((row) => row[fieldToAggregate]));
          break;
        case "MAX":
          aggregatedValues[aggFunction + "(" + fieldToAggregate + ")"] =
            Math.max(...data.map((row) => row[fieldToAggregate]));
          break;
        case "AVG":
          const sum = data.reduce(
            (acc, row) => acc + Number(row[fieldToAggregate]),
            0
          );
          const count = data.length;
          aggregatedValues[aggFunction + "(" + fieldToAggregate + ")"] =
            count > 0 ? sum / count : null;
          break;
      }
    });
    return [aggregatedValues];
  }

  const groupMap = new Map();

  data.forEach((row) => {
    const groupKey = groupByFields
      ? groupByFields.map((field) => row[field]).join("_")
      : "";
    const group = groupMap.get(groupKey) || { rows: [], count: 0 };
    group.rows.push(row);
    group.count++;
    groupMap.set(groupKey, group);
  });

  const results = [];
  for (const [groupKey, group] of groupMap.entries()) {
    const aggregatedValues = {};
    aggregateFields.forEach((field) => {
      const { function: aggFunction, on: fieldToAggregate, as } = field;
      switch (aggFunction.toUpperCase()) {
        case "COUNT":
          if (as) {
            aggregatedValues[as.trim()] = group.count;
          } else {
            aggregatedValues[aggFunction + "(" + fieldToAggregate + ")"] =
              group.count;
          }
          break;
        case "SUM":
          const initialValue =
            group.rows.length > 0 ? Number(group.rows[0][fieldToAggregate]) : 0;
          aggregatedValues[aggFunction + "(" + fieldToAggregate + ")"] =
            group.rows.reduce(
              (acc, row) => acc + Number(row[fieldToAggregate]),
              initialValue
            );
          break;
        case "MIN":
          aggregatedValues[aggFunction + "(" + fieldToAggregate + ")"] =
            Math.min(...group.rows.map((row) => row[fieldToAggregate]));
          break;
        case "MAX":
          aggregatedValues[aggFunction + "(" + fieldToAggregate + ")"] =
            Math.max(...group.rows.map((row) => row[fieldToAggregate]));
          break;
        case "AVG":
          let sum = 0;
          let count = 0;
          for (const row of group.rows) {
            const value = Number(row[fieldToAggregate]);
            if (!isNaN(value)) {
              sum += value;
              count++;
            }
          }
          aggregatedValues[aggFunction + "(" + fieldToAggregate + ")"] =
            count > 0 ? sum / count : null;
          break;
      }
    });

    if (groupByFields) {
      const groupRow = {};
      groupByFields.forEach(
        (field) => (groupRow[field] = group.rows[0][field])
      );
      results.push({ ...groupRow, ...aggregatedValues });
    } else {
      results.push(aggregatedValues);
    }
  }

  return results;
}

function evaluateCondition(row, clause) {
  let { field, operator, value } = clause;
  value = trimQuotes(value);
  if (row[field] === undefined) return true;
  if (operator === "LIKE") {
    const regexPattern = "^" + value.replace(/%/g, ".*") + "$";
    return new RegExp(regexPattern, "i").test(row[field]);
  }
  switch (operator) {
    case "=":
      return row[field] === value;
    case "!=":
      return row[field] !== value;
    case ">":
      return row[field] > value;
    case "<":
      return row[field] < value;
    case ">=":
      return row[field] >= value;
    case "<=":
      return row[field] <= value;
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

function trimQuotes(inputString) {
  return inputString.replace(/^['"]|['"]$/g, "");
}

async function executeINSERTQuery(query) {
  try {
    let { type, table, columns, values } = parseInsertQuery(query);

    columns = columns.map((column) => {
      return trimQuotes(column);
    });
    values = values.map((value) => {
      return trimQuotes(trimQuotes(value));
    });

    const filePath = `${table}.csv`;
    const existingData = await readCSV(filePath);
    const newRow = { ...values };

    existingData.push(newRow);

    await writeCSV(filePath, existingData);
  } catch (error) {
    console.error("Error executing INSERT query:", error.message);
    throw error;
  }
}
async function executeDELETEQuery(query) {
  const { type, table, whereClauses } = parseDeleteQuery(query);
  let data = await readCSV(`${table}.csv`);
  if (whereClauses.length > 0) {
    data = data.filter((row) => {
      return whereClauses.some((clause) => !evaluateCondition(row, clause));
    });
  } else {
    data = [];
  }
  await writeCSV(`${table}.csv`, data);
  const afterData = await readCSV(`${table}.csv`);

  return { message: "Rows deleted successfully." };
}

module.exports = { executeSELECTQuery, executeINSERTQuery, executeDELETEQuery };
