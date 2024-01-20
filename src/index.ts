import { AzureKeyCredential } from "@azure/core-auth";
import { OpenAIClient, type ChatRequestMessage } from "@azure/openai";
import bodyParser from "body-parser";
import cors from "cors";
import * as dotenv from "dotenv";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { existsSync } from "fs";
import * as path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dotenvPath = path.join(__dirname, "..", ".env");
if (!existsSync(dotenvPath)) {
  console.log("Please create a .env file with you Azure Open AI information.")
  process.exit(1);
}
dotenv.config({ path: dotenvPath });

const server_port = parseInt(process.env.SERVER_PORT || "3000");

const Message = z.object({
  role: z.string(),
  name: z.string().optional(),
  content: z.string(),
});

const Input = z.object({
  messages: z.array(Message),
});

const credential = new AzureKeyCredential(
  process.env.AZURE_OPENAI_API_KEY || ""
);
const openai = new OpenAIClient(
  process.env.AZURE_OPENAI_ENDPOINT || "",
  credential
);

const app = express();
app.set("view engine", "ejs");
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

app.post(
  "/oauth/callback",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/webhook",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }
);

app.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const json = req.body;
  const input = Input.safeParse(json);

  if (!input.success) {
    res.status(400);
    return res.json({ error: "Bad request" });
  }

  const messages = input.data.messages;
  console.debug("received input", JSON.stringify(json, null, 4));
  console.debug("received messages", JSON.stringify(messages, null, 4));

  // Insert a special hackery system message in our message list.
  messages.splice(-1, 0, {
    role: "system",
    content: "Please use entirely made-up hackery-sounding terminology.",
  });

  const stream = await openai.streamChatCompletions(
    process.env.AZURE_OPENAI_DEPLOYMENT || "",
    messages as ChatRequestMessage[]
  );
  console.debug(
    "Sending request to Azure OpenAI",
    JSON.stringify(messages, null, 4)
  );

  res.setHeader("Content-Type", "text/event-stream");
  for await (const chunk of stream) {
    (chunk as any).created = chunk.created.getUTCSeconds();
    console.log("Sending chunk: ", JSON.stringify(chunk));
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  console.log("Finished sending response");
  res.end();
});

app.listen(server_port, () => {
  console.log(`Listening on port ${server_port}`);
});
