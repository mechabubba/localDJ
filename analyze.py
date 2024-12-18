"""
BUG: does not support mp3s or m4as, seemingly only flacs.
fine for now... thankfully my lib is mostly flacs.
"""
import argparse
from datetime import timedelta
import json
import logging
from mutagen import File
import os
import random
import traceback

parser = argparse.ArgumentParser(
    prog="analyze",
    description="Analyzes the audio files of a directory.",
)
parser.add_argument("-a", "--alphabetical", action="store_true")
parser.add_argument("-s", "--silent", action="store_true")
parser.add_argument("-d", "--denom", type=int)
args = parser.parse_args()

NAME = f"manifest{'_small' if args.alphabetical else ''}"
VALID_EXTS = ['.mp3', '.flac', '.ogg', '.m4a', '.wav', '.wma', '.aac']

data = {}

log = logging.getLogger(__name__)
if args.silent:
    log.setLevel(logging.CRITICAL)
else:
    log.setLevel(logging.INFO)

def timestampify(seconds):
    td = timedelta(seconds=seconds)
    formatted_timestamp = str(td).split('.')[0]
    hours, minutes, secs = map(int, formatted_timestamp.split(':'))
    return f"{hours:02}:{minutes:02}:{secs:02}"

def parse_song(file):
    #print(file)
    t = file.tags
    i = file.info
    
    # for some reason, mutagen does everything in terms of lists.
    # annoying.

    _artist = (t["ALBUMARTIST"] if "ALBUMARTIST" in t else t["ARTIST"])[0]
    if args.alphabetical:
        # this arg produces a VERY SMALL CATALOG that only uses an artist for every unique first char.
        al = _artist.lower()
        last_alphabetical_artist = next((x for x in data if x.lower().startswith(al[0])), None)
        if last_alphabetical_artist:
            return

    if not _artist in data:
        data[_artist] = {
            "albums": []
        }
    artist = data[_artist]
    
    _album = t["ALBUM"][0]
    album = next((x for x in artist["albums"] if x["title"] == _album), None)
    if not album:
        album = {
            "title": _album,
            "date": t["DATE"][0] if "DATE" in t else -1,
            "songs": []
        }

        if "TRACKTOTAL" in t:
            album["total_tracks"] = int(t["TRACKTOTAL"][0])
        if "GENRE" in t:
            album["genres"] = t["GENRE"]
        if "COMPOSER" in t:
            album["composers"] = t["COMPOSER"]
        if "DISCTOTAL" in t:
            album["total_discs"] = int(t["DISCTOTAL"][0])

        artist["albums"].append(album)
    
    _song = t["TITLE"][0]
    song = next((x for x in album["songs"] if x["title"] == _song), None)
    if not song:
        song = {
            "artists": t["ARTIST"],
            "track_number": int(t["TRACKNUMBER"][0]),
            "title": _song,
            "duration": timestampify(i.length),
            "filepath": file.filename
        }
        
        if "DISC" in t:
            song["disc_number"] = t["DISC"][0]
        
        album["songs"].append(song)

def main():
    # walk your directory of music.
    # as long as your tags are correct, the above func is file-structure agnostic.
    log.info("Walking music folder...")
    for root, dirs, files in os.walk("."):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in VALID_EXTS:
                filepath = f"{root}/{file}"
                try:
                    audio = File(filepath)
                    if audio:
                        parse_song(audio)
                    else:
                        log.error(f"Unsupported or corrupted file: {filepath}")
                except Exception as e:
                    log.error(f"Error parsing {filepath}; {traceback.format_exc()}")

    # process some missing parameters 
    for _artist in data:
        artist = data[_artist]
        for album in artist["albums"]:
            if not "total_tracks" in album:
                album["total_tracks"] = len(album["songs"])

    with open(f"{NAME}.json", "w") as file:
        file.write(json.dumps(data))
        log.info(f"Wrote {NAME}.json :D")

    # more post processing. this will allow a smaller file for processing.
    # additionally, some random sorting of artist keys.
    log.info("Post-processing...")
    for _artist in data:
        artist = data[_artist]
        for album in artist["albums"]:
            if "total_tracks" in album:
                del album["total_tracks"]
            if "total_discs" in album:
                del album["total_discs"]
            if "composers" in album:
                del album["composers"]
            
            for song in album["songs"]:
                if "track_number" in song:
                    del song["track_number"]
                if "filepath" in song:
                    del song["filepath"]

    # shuffle it, sink it
    log.info("Shuffling...")
    l = list(data.items())
    random.shuffle(l)
    d = dict(l)

    if args.denom:
        log.info(f"Chopping off the first 1/{args.denom} of it...")
        d = dict(list(d.items())[len(d)//args.denom:])

    with open(f"{NAME}_compact.json", "w") as file:
        file.write(json.dumps(data, separators=(',', ':')))
        log.info(f"Wrote {NAME}_compact.json :D")

if __name__ == '__main__':
    main()

"""
Example schema;
{
    "...&more...": {
        "albums": [
            {
                "title": "Existence Is Existential",
                "date": "2016",
                "songs": [
                    {
                        "artists": ["...&more..."],
                        "track_number": 1,
                        "title": "Life is an Existential Crisis",
                        "duration": "00:02:59",
                        "filepath": ".\\&more... - (2016) Existence Is Existential [WEB-FLAC]/01 Life is an Existential Crisis.flac"
                    },
                    {
                        "artists": ["...&more..."],
                        "track_number": 2,
                        "title": "Presents",
                        "duration": "00:03:23",
                        "filepath": ".\\&more... - (2016) Existence Is Existential [WEB-FLAC]/02 Presents.flac"
                    },
                    ...
                ],
                "total_tracks": 11,
                "total_discs": 1
            }
            ...
        ]
    }
    ...
}
"""
