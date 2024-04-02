function parseQuery(query) {
  const selectRegex = /SELECT (.+?) FROM (.+?)(?: WHERE (.*))?$/i;
  const match = query.match(selectRegex);

  if (match) {
    const [, fields, table, whereString] = match;
    const whereClauses = whereString ? parseWhereClause(whereString) : [];
    return {
      fields: fields.split(",").map((field) => field.trim()),
      table: table.trim(),
      whereClauses,
    };
  } else {
    throw new Error("Invalid query format");
  }
}

function parseWhereClause(whereString) {
  if (!whereString) {
    throw new Error("No WHERE clause provided");
  }

  const conditions = whereString.split(/ AND | OR /i);
  return conditions.map((condition) => {
    const [field, operator, value] = condition.split(/\s+/);

    if (!field || !operator || !value) {
      throw new Error(`Invalid condition: ${condition}`);
    }

    return { field, operator, value };
  });
}

module.exports = parseQuery;
