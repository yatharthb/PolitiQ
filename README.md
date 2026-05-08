# PolitiQ

A small static site for U.S. civic-literacy quizzes. No build step — open
the HTML files directly or serve the directory.

## Pages

- `index.html` — homepage with hero, quiz cards, and a short "why this exists" section.
- `senators.html` — name every U.S. Senator (100), 15-minute timer.
- `house.html` — name every current voting U.S. Representative (~430 in this snapshot), 45-minute timer.

## Matching

The single quiz input accepts:

- Last name alone, when the surname is unique to one member.
- First + last when the surname is shared (e.g. "Mike Johnson", "Tim Scott").
- Full official name (with or without middle initials and suffixes).
- Common nicknames where present in the source data ("Bernie", "Mitch", "Liz").
- Diacritics ignored ("Lujan" matches "Luján").
- Hyphenated last names accept either form ("Hyde-Smith" or full name).

## Data

`assets/data/senators.js` and `assets/data/house.js` are generated from the
public-domain
[@unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators)
`legislators-current.yaml`. Non-voting territory delegates are excluded
from the House quiz to match the standard 435-seat framing.

## Local preview

```sh
npx serve .
# or any static server, e.g.: python3 -m http.server 8000
```
