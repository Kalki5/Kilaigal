import { DynamoDBClient, CreateTableCommand, ListTablesCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import app from './index.js';

const PORT = 3001;

// Mock DynamoDB endpoint for local development
process.env.DYNAMODB_ENDPOINT = "http://localhost:8000";
process.env.AWS_REGION = "us-east-1";
process.env.TABLE_NAME = "FamilyTreeTable";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  endpoint: process.env.DYNAMODB_ENDPOINT,
});

const REQUIRED_GSIS = ["MemberRelationsIndex", "TargetRelationsIndex"];

async function checkGSIs() {
  try {
    const desc = await client.send(new DescribeTableCommand({ TableName: process.env.TABLE_NAME }));
    const existingGSIs = (desc.Table.GlobalSecondaryIndexes || []).map(g => g.IndexName);
    const missingGSIs = REQUIRED_GSIS.filter(name => !existingGSIs.includes(name));
    if (missingGSIs.length > 0) {
      console.warn(`⚠️  Table "${process.env.TABLE_NAME}" is missing GSIs: ${missingGSIs.join(", ")}.`);
      console.warn("   To add them, delete the table and restart so it gets recreated with GSIs:");
      console.warn("   docker-compose down -v && docker-compose up -d");
    }
  } catch (err) {
    console.error("Error checking GSIs:", err.message);
  }
}

async function ensureTableExists() {
  try {
    const list = await client.send(new ListTablesCommand({}));
    if (list.TableNames.includes(process.env.TABLE_NAME)) {
      console.log(`Table ${process.env.TABLE_NAME} already exists.`);
      await checkGSIs();
      return;
    }

    console.log(`Creating table ${process.env.TABLE_NAME}...`);
    await client.send(new CreateTableCommand({
      TableName: process.env.TABLE_NAME,
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" }
      ],
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
        { AttributeName: "fromId", AttributeType: "S" },
        { AttributeName: "toId", AttributeType: "S" }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "MemberRelationsIndex",
          KeySchema: [
            { AttributeName: "fromId", KeyType: "HASH" },
            { AttributeName: "SK", KeyType: "RANGE" }
          ],
          Projection: { ProjectionType: "ALL" }
        },
        {
          IndexName: "TargetRelationsIndex",
          KeySchema: [
            { AttributeName: "toId", KeyType: "HASH" },
            { AttributeName: "SK", KeyType: "RANGE" }
          ],
          Projection: { ProjectionType: "ALL" }
        }
      ],
      BillingMode: "PAY_PER_REQUEST"
    }));
    console.log("Table created successfully with GSIs.");
  } catch (err) {
    console.error("Error ensuring table exists:", err.message);
  }
}

app.listen(PORT, async () => {
  console.log(`Backend listening at http://localhost:${PORT}`);
  await ensureTableExists();
});
