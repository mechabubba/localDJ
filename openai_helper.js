import * as fs from "node:fs";
import path from 'node:path';
import OpenAI from "openai";
import "dotenv/config";

// the brains
const openai = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"]
})

const model = 'gpt-4o';

// our prompts in use
const prompts = {
    system: {
        initial: `You're a radio host! You play the tunes people want to hear when they hit your station. You have a limited catalog; I'll send what you can choose from in chunks of JSON.`,
        
        continuous: `You're a radio host! You were passed some preprocessed data, and now you're now ready to take suggestions.
Users will send in their requests; your job is to either fill them, or choose something closest to what they want to hear.
Choose a different song for each query. Respond only with valid JSON in the following format;
{
    "song": [
        {
            "artist": "[Artist name]",
            "title": "[Song title]"
        },
        ...
    ],
    "message": "[A message in response to the suggestor, in the style of a radio announcer.]"
}
Choose 3 songs, and only choose from songs I've sent to you. For artist and song of choice, please recite them exactly as recieved.`
    },
};

// random stuff to keep track of
const processedData = []; // anomalous data
const songs_heard = [];   // songs we've """heard"""

// Function to split text into chunks
function splitIntoChunks(data, maxTokens = 4096) {
    const chunks = [];
    let currentChunk = '';
  
    for (const [key, value] of Object.entries(data)) {
        const itemString = JSON.stringify({ [key]: value });
        if ((currentChunk + itemString).length > maxTokens) {
            chunks.push(currentChunk);
            currentChunk = "";
        }
        currentChunk += itemString + '\n'; // Add a newline for readability
    }
    
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
}

// using this as a flag to make sure we don't run query early.
let good_to_go = false;

async function processLargeJSON(filePath) {
    try {
        // Step 1: Read and parse the JSON file
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Step 2: Split the data into manageable chunks
        const maxTokensPerChunk = 3500; // Adjust for model's token limit
        const chunks = splitIntoChunks(jsonData, maxTokensPerChunk);

        // Step 3: Preprocess chunks with the API
        for (const chunk of chunks) {
            console.log("Processing chunk...");
            const response = await openai.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: prompts.system.initial },
                    { role: 'user', content: chunk },
                ],
            });
        
            console.log(response);
            processedData.push(response.choices[0].message.content);
        }
    } catch (e) {
        console.error('Error processing file: ', e);
        process.exit(1); // kick the bucket while we still can
    }

    console.log("Good to go! <3");
    good_to_go = true;
}

async function query(msg) {
    if (!good_to_go) {
        throw new Error("You are calling this too early.");
    }

    let json;
    try {
        // Pass user query along with processed data to the model
        const response = await openai.chat.completions.create({
            model: model,
            messages: [
                { role: 'system', content: prompts.system.continuous },
                { role: 'user', content: `Here is the processed data: ${processedData.join('\n')}` },
                { role: 'user', content: `You've played these songs before: ${songs_heard.join('\n')}`},
                { role: 'user', content: `Now, respond to this: ${msg}` },
            ]
        });
            
        //console.log('Response:', response.choices[0].message.content);

        // mark the song heard. continue on...
        let resp = response.choices[0].message.content.trim();
        if (resp.startsWith("```")) {
            resp = resp.replace(/^\s*```json\s*|```[\S\s]*$/g, '').trim();
        }

        json = JSON.parse(resp);
        if (!Array.isArray(json.song)) {
            console.warn("WARNING: got a weird response... see below;");
            console.warn(json)
        } else {
            songs_heard.push(...json["song"]);
        }
    } catch (e) {
        console.error('Error in query loop: ', e);
        return e;
    }
    return json;
}

async function speakYourMind(text, voice, id) {
    // i'm naming methods like this, now you know i've lost it. its 5:30 am.
    // i'm wrapping this in a big try catch just in case it dies for whatever reason.
    // ...and because the rest of them are. i swear i'm good at what i do.
    try {
        const speechFile = path.resolve(`./cache/${id}.mp3`);
        const mp3 = await openai.audio.speech.create({
            model: "tts-1",
            voice: voice,
            input: text,
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.promises.writeFile(speechFile, buffer);
        return true;
    } catch(e) {
        console.error('Error in voice gen; ', e);
        return false;
    }
}

export default { processLargeJSON, query, speakYourMind };
