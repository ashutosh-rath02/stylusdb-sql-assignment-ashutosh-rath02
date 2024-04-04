const { readCSV } = require("../../src/csvReader");
const { executeSELECTQuery } = require("../../src/index");
const { parseJoinClause, parseSelectQuery } = require("../../src/queryParser");

test("Read CSV File", async () => {
  const data = await readCSV("./student.csv");
  expect(data.length).toBeGreaterThan(0);
  expect(data.length).toBe(4);
  expect(data[0].name).toBe("John");
  expect(data[0].age).toBe("30"); //ignore the string type here, we will fix this later
});

test("Parse SQL Query", () => {
  const query = "SELECT id, name FROM student";
  const parsed = parseSelectQuery(query);
  expect(parsed).toEqual({
    fields: ["id", "name"],
    table: "student",
    whereClauses: [],
    joinCondition: null,
    orderByFields: null,
    joinTable: null,
    joinType: null,
    groupByFields: null,
    hasAggregateWithoutGroupBy: false,
    limit: null,
    isDistinct: false,
  });
});

test("Parse Invalid SQL Query", () => {
  const Invalidquery = "TARGET id, name OF student";
  expect(() => {
    parseSelectQuery(Invalidquery);
  }).toThrow("Invalid SELECT format");
});
