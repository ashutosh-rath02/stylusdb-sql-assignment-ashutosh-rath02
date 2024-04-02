function parseQuery(query) {
  query = query.trim();
  let selectPart, fromPart;
  const whereSplit = query.split(/\sWHERE\s/i);
  query = whereSplit[0];
  const whereClause = whereSplit.length > 1 ? whereSplit[1].trim() : null;
  const joinSplit = query.split(/\sINNER JOIN\s/i);
  selectPart = joinSplit[0].trim();
  const joinPart = joinSplit.length > 1 ? joinSplit[1].trim() : null;
  const selectRegex = /^SELECT\s(.+?)\sFROM\s(.+)/i;
  const selectMatch = selectPart.match(selectRegex);
  if (!selectMatch) {
    throw new Error("Invalid SELECT format");
  }
  const [, fields, table] = selectMatch;
  // Parse the JOIN part if it exists
  let joinTable = null,
    joinCondition = null;
  if (joinPart) {
    const joinRegex = /^(.+?)\sON\s([\w.]+)\s*=\s*([\w.]+)/i;
    const joinMatch = joinPart.match(joinRegex);
    if (!joinMatch) {
      throw new Error("Invalid JOIN format");
    }

    joinTable = joinMatch[1].trim();
    joinCondition = {
      left: joinMatch[2].trim(),
      right: joinMatch[3].trim(),
    };
  }

  // Parse the WHERE part if it exists
  let whereClauses = [];
  if (whereClause) {
    whereClauses = parseWhereClause(whereClause);
  }

  return {
    fields: fields.split(",").map((field) => field.trim()),
    table: table.trim(),
    whereClauses,
    joinTable,
    joinCondition,
    joinType: null,
  };
}

function parseWhereClause(whereString) {
  const conditionRegex = /(.*?)(=|!=|>|<|>=|<=)(.*)/;
  return whereString.split(/ AND | OR /i).map((conditionString) => {
    const match = conditionString.match(conditionRegex);
    if (match) {
      const [, field, operator, value] = match;
      return { field: field.trim(), operator, value: value.trim() };
    }
    throw new Error("Invalid WHERE clause format");
  });
}

function parseJoinClause(query) {
  const joinRegex =
    /\s(INNER|LEFT|RIGHT) JOIN\s(.+?)\sON\s([\w.]+)\s*=\s*([\w.]+)/i;
  const joinMatch = query.match(joinRegex);
  if (joinMatch) {
    return {
      joinType: joinMatch[1].trim(),
      joinTable: joinMatch[2].trim(),
      joinCondition: {
        left: joinMatch[3].trim(),
        right: joinMatch[4].trim(),
      },
    };
  }
  return {
    joinType: null,
    joinTable: null,
    joinCondition: null,
  };
}
module.exports = { parseQuery, parseJoinClause };
