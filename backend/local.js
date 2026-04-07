import { DynamoDBClient, CreateTableCommand, ListTablesCommand } from "@aws-sdk/client-dynamodb";
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

async function ensureTableExists() {
  try {
    const list = await client.send(new ListTablesCommand({}));
    if (list.TableNames.includes(process.env.TABLE_NAME)) {
      console.log(`Table ${process.env.TABLE_NAME} already exists.`);
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
        { AttributeName: "SK", AttributeType: "S" }
      ],
      BillingMode: "PAY_PER_REQUEST"
    }));
    console.log("Table created successfully.");
  } catch (err) {
    console.error("Error ensuring table exists:", err.message);
  }
}

app.listen(PORT, async () => {
  console.log(`Backend listening at http://localhost:${PORT}`);
  await ensureTableExists();
});
