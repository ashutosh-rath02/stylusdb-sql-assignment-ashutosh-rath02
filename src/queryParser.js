function parseWhereClause(whereString) {
  const conditionRegex = /(.*?)(=|!=|>|<|>=|<=)(.*)/;
  return whereString.split(/ AND | OR /i).map((conditionString) => {
    if (conditionString.includes(" LIKE ")) {
      const condition = conditionString.split(/\sLIKE\s/i);
      const [field, pattern] = condition;
      return { field: field.trim(), operator: "LIKE", value: pattern.trim() };
    }
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

function parseInsertQuery(query) {
  const regex = /INSERT INTO (\w+)\s*(?:\(([^)]+)\))?\s*VALUES\s*\(([^)]+)\)/i;
  const match = query.match(regex);

  if (match) {
    const table = match[1];
    const columns = match[2]?.split(/\s*,\s*/).map((col) => `'${col}'`) || [];
    const values = match[3].split(/\s*,\s*/).map((val) => `'${val}'`);
    return {
      type: "INSERT",
      table,
      columns,
      values,
    };
  }
}

function parseDeleteQuery(query) {
  const pattern = /^DELETE\s+FROM\s+(.+?)\s+WHERE\s+(.+?)$/i;
  const match = query.trim().match(pattern);

  if (!match) {
    throw new Error("Invalid DELETE query format");
  }

  const table = match[1];
  const whereClause = match[2];

  const whereClauses = parseWhereClause(whereClause);
  return {
    type: "DELETE",
    table,
    whereClauses,
  };
}

function getGroupByFields(groupBySplit) {
  if (groupBySplit.length > 1) {
    return groupBySplit[1].split(",").map((field) => field.trim());
  } else return null;
}

function parseSelectQuery(query) {
  try {
    query = query.trim();

    let selectPart, fromPart;
    let hasAggregateWithoutGroupBy = false;
    let isDistinct = false;
    if (query.toUpperCase().includes("SELECT DISTINCT")) {
      isDistinct = true;
      query = query.replace("SELECT DISTINCT", "SELECT");
    }
    const limitSplit = query.split(/\LIMIT\s/i);
    query = limitSplit[0];
    let limit = null;
    if (limitSplit[1]) {
      limit = parseInt(limitSplit[1]);
    }

    const orderByMatch = query.split(/\ORDER BY\s/i);
    query = orderByMatch[0];
    let orderByFields = null;

    if (orderByMatch[1]) {
      orderByFields = orderByMatch[1].split(",").map((field) => {
        const [fieldName, order] = field.trim().split(/\s+/);
        return { fieldName, order: order ? order.toUpperCase() : "ASC" };
      });
    }

    const groupBySplit = query.split(/\GROUP BY\s/i);
    query = groupBySplit[0];
    const groupByFields = getGroupByFields(groupBySplit);

    const whereSplit = query.split(/\sWHERE\s/i);
    query = whereSplit[0];

    const whereClause = whereSplit.length > 1 ? whereSplit[1].trim() : null;

    const joinSplit = query.split(/\s(INNER|LEFT|RIGHT) JOIN\s/i);
    selectPart = joinSplit[0].trim();

    const joinPart = joinSplit.length > 1 ? joinSplit[1].trim() : null;
    const joinClause = parseJoinClause(query);
    const joinType = joinClause.joinType;
    const joinTable = joinClause.joinTable;
    const joinCondition = joinClause.joinCondition;
    const selectRegex = /^SELECT\s(.+?)\sFROM\s(.+)/i;
    const selectMatch = selectPart.match(selectRegex);
    if (!selectMatch) {
      throw new Error("Invalid SELECT format");
    }

    const [, fields, table] = selectMatch;

    let whereClauses = [];

    if (whereClause) {
      whereClauses = parseWhereClause(whereClause);
    }

    const temp = fields.split(",").map((field) => field.trim());

    temp.map((field) => {
      const match = field.match(/^(AVG|SUM|COUNT|MIN|MAX)\((.+)\)/i);
      if (match && !groupByFields) {
        hasAggregateWithoutGroupBy = true;
      }
    });

    return {
      fields: fields.split(",").map((field) => field.trim()),
      table: table.trim(),
      whereClauses,
      joinTable,
      joinCondition,
      joinType,
      groupByFields,
      hasAggregateWithoutGroupBy,
      orderByFields,
      limit,
      isDistinct,
    };
  } catch (error) {
    throw new Error(`Query parsing error: ${error.message}`);
  }
}

module.exports = {
  parseSelectQuery,
  parseJoinClause,
  parseInsertQuery,
  parseDeleteQuery,
};
