import { BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
});

const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "FamilyTreeTable";

const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;

/**
 * Split an array into chunks of the given size.
 * @param {any[]} array - The array to chunk
 * @param {number} size - Maximum chunk size
 * @returns {any[][]} Array of chunks
 */
export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sleep for the specified number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load multiple members by their IDs using BatchGetItem.
 * Handles chunking (100 per batch) and retries for UnprocessedKeys.
 * @param {string[]} memberIds - Array of member UUIDs
 * @returns {Promise<object[]>} - Array of member records
 */
export async function batchGetMembers(memberIds) {
  if (!memberIds || memberIds.length === 0) {
    return [];
  }

  // Deduplicate input IDs
  const uniqueIds = [...new Set(memberIds)];

  const chunks = chunkArray(uniqueIds, BATCH_SIZE);
  const allResults = [];

  for (const chunk of chunks) {
    const keys = chunk.map((id) => ({ PK: "MEMBERS", SK: `MEMBER#${id}` }));

    const command = new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: keys,
        },
      },
    });

    let response;
    try {
      response = await docClient.send(command);
    } catch (error) {
      console.error("BatchGetCommand failed:", error.message);
      continue;
    }

    // Collect successful results
    if (response.Responses && response.Responses[TABLE_NAME]) {
      allResults.push(...response.Responses[TABLE_NAME]);
    }

    // Handle UnprocessedKeys with exponential backoff
    let unprocessedKeys = response.UnprocessedKeys?.[TABLE_NAME];
    let retryCount = 0;

    while (unprocessedKeys && unprocessedKeys.Keys && unprocessedKeys.Keys.length > 0 && retryCount < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, retryCount); // 100ms, 200ms, 400ms
      await sleep(delay);

      const retryCommand = new BatchGetCommand({
        RequestItems: {
          [TABLE_NAME]: unprocessedKeys,
        },
      });

      try {
        const retryResponse = await docClient.send(retryCommand);

        if (retryResponse.Responses && retryResponse.Responses[TABLE_NAME]) {
          allResults.push(...retryResponse.Responses[TABLE_NAME]);
        }

        unprocessedKeys = retryResponse.UnprocessedKeys?.[TABLE_NAME];
      } catch (error) {
        console.error(`Retry ${retryCount + 1} failed:`, error.message);
        break;
      }

      retryCount++;
    }

    // Log warning for any remaining unprocessed keys after retries
    if (unprocessedKeys && unprocessedKeys.Keys && unprocessedKeys.Keys.length > 0) {
      const unprocessedIds = unprocessedKeys.Keys.map((key) => key.SK.replace("MEMBER#", ""));
      console.warn(
        `BatchGetMembers: ${unprocessedIds.length} member(s) could not be loaded after ${MAX_RETRIES} retries:`,
        unprocessedIds
      );
    }
  }

  return allResults;
}
