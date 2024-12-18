# localDJ
Spotify DJ for your MP3s.

This repo contains two parts;
- A web interface to interact with.
- A python script that analyzes your local media directory and generates a "manifest" of it.

Some of this code was AI-generated. Use at your own peril.

## Usage
Before all else, download the dependencies; `npm i` and `pip install -r requirements.txt`.
1. Create a `.env` file in the root of the repo, throw an `OPENAI_API_KEY` in it.
2. Run the `analyze.py` script in the root of your music folder. You have a few options to configure here, so take a look at them to determine if you want to change anything. Generally, I've found that a 550kb file is the best choice to feed into ChatGPT.
3. Place that in the root of this folder, edit the file that `index.js` looks for, and launch.

Written with <3 for GAIT '24 @ UIOWA
