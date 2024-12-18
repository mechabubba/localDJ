import { App } from "@tinyhttp/app";
import "dotenv/config";
import { renderFile } from "eta";
import sirv from "sirv";
import { v4 as uuid } from 'uuid';
import { WebSocketServer } from 'ws';

import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import openai_helper from "./openai_helper.js";

const config = {
    server_port: 3000,
    ws_port: 8080
};

// the webserver itself is based on tinyhttp, an express-like npm module thats lightweight and fast.
const app = new App({
    settings: {
        networkExtensions: true,
        xPoweredBy: true,
    },
    onError: (error, req, res) => {
        res.status(500);
        console.error({
            "ip": req.ip || req.socket.remoteAddress || null,
            "method": req.method,
            "code": res.statusCode,
            "url": req.originalUrl || req.url || null,
            "error": error.name || null,
            "stack": error.stack || null,
        }, error);
        return res.send("500 Internal Server Error");
    },
});

app.engine("eta", renderFile); // using eta as the rendering engine. see: https://eta.js.org/

// wss stuff
const wss = new WebSocketServer({
    port: config.ws_port
});

wss.on('connection', function connection(ws) {
    ws.on('error', console.error);
    ws.on('message', async function message(data) {
        console.log('received: %s', data);
        let json;
        try {
            json = JSON.parse(data);
        } catch(e) {
            ws.send("{\"type\": \"message\", \"message\": \"Server failed to get your response. D:\"}");
            console.error(e);
        }

        if ("type" in json) {
            switch(json.type) {
                case "ping": {
                    ws.send("{\"type\": \"message\", \"message\": \"pong\"}");
                    break;
                }
                case "query": {
                    const resp = await openai_helper.query(json.message);
                    const id = uuid();

                    resp["has_voice"] = await openai_helper.speakYourMind(resp["message"], "onyx", id); // onyx is the openai voice that sounded most like a radio guy, they all kinda suck
                    resp["id"] = id;
                    resp["type"] = "message"; // add type to the thing so client knows this was sent with meaning

                    ws.send(JSON.stringify(resp));
                    break;
                }
                default: {
                    ws.send("{\"type\": \"message\", \"message\": \"Server recieved an unknown command.\"}");
                    break;
                }

            }
        }
    });
});

// basic logging
app.use((req, res, next) => {
    const time = Date.now();
    res.on("finish", () => {
        const ms = Date.now() - time;
        const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "debug" : "trace";
        console.log({
            "ip": req.ip || req.socket.remoteAddress || null,
            "method": req.method,
            "code": res.statusCode,
            "url": req.originalUrl || req.url || null,
            "cookies": req.cookies,
            "responseTime": `${ms}ms`,
        }, res.statusMessage);
    });
    next();
});

// static files
app.use("/", sirv(path.join(path.dirname(fileURLToPath(import.meta.url)), "public"), {
    dev: true,
}));

// index
app.get("/", (req, res, next) => res.render("index.eta", { name: "eta" }));

// endpoint for audio stuff
app.use("/voice/:id", async (req, res, next) => {
    if (!req.params.id) {
        return res.status(400).send("No ID provided");
    } else {
        const file = path.resolve(`./cache/${req.params.id}.mp3`);    
        try {
            // Read the file
            const audioBuffer = await fs.promises.readFile(file);

            // Set appropriate headers
            res.set('Content-Type', 'audio/mpeg'); // Content-Type for MP3 files
            res.set('Content-Length', audioBuffer.length);

            // Send the file as a response
            res.send(audioBuffer);
        } catch (e) {
            console.error('Error serving audio:', e);
            res.status(500).send('Error serving audio');
        }
    }
    next();
});

(async () => {
    // before we start, do the chunking thing
    await openai_helper.processLargeJSON("data/manifest_compact.json");

    // rock n roll
    app.listen(config.server_port, () => console.log(`[READY] Web server listening on port ${config.port}`)); // rock and roll
})();
