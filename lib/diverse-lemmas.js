const loadedLemmatizers = new Map();
let cdnBase = new URL("../lemma-data/", import.meta.url).href.replace(/\/$/, "");

function normalizeDefault(text) {
  return text.normalize("NFC").toLowerCase();
}

function createLemmatizer({ lang, wordDict, ambiguityMap = null }) {
  const normalize = normalizeDefault;

  function rankCandidates(candidates, ambiguityForm) {
    if (!ambiguityMap) {
      return [...candidates];
    }

    const ambiguity = ambiguityMap[ambiguityForm];
    const frequencies = new Map();
    if (ambiguity?.lemmas) {
      for (const [lemma, count] of ambiguity.lemmas) {
        frequencies.set(lemma, count);
      }
    }

    return [...candidates].sort((left, right) => (frequencies.get(right) || 0) - (frequencies.get(left) || 0));
  }

  function lemmatizeWord(word) {
    const normalized = normalize(word);
    const candidates = new Set();
    let method = "unknown";

    if (ambiguityMap) {
      const ambiguity = ambiguityMap[normalized];
      if (ambiguity?.lemmas) {
        for (const [lemma] of ambiguity.lemmas) {
          candidates.add(lemma);
        }
      }
    }

    const directHit = wordDict[normalized];
    if (directHit) {
      candidates.add(directHit);
      method = "direct";
    }

    if (candidates.size === 0) {
      candidates.add(normalized);
    }

    return {
      lemmas: rankCandidates(candidates, normalized),
      method
    };
  }

  function lemmatizeWords(words) {
    return words.map((word) => ({
      word,
      ...lemmatizeWord(word)
    }));
  }

  return {
    lang,
    wordDict,
    ambiguityMap,
    lemmatizeWord,
    lemmatizeWords
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

export function setCDN(url) {
  cdnBase = url.replace(/\/$/, "");
}

export function getLemmatizer(lang) {
  return loadedLemmatizers.get(lang) || null;
}

export async function loadLanguage(lang) {
  if (loadedLemmatizers.has(lang)) {
    return loadedLemmatizers.get(lang);
  }

  const dictionaryUrl = `${cdnBase}/${lang}/lemmas.json`;
  const dictionaryData = await fetchJson(dictionaryUrl);
  const wordDict = dictionaryData.word_dict || dictionaryData;

  let ambiguityMap = null;
  try {
    ambiguityMap = await fetchJson(`${cdnBase}/${lang}/ambiguity_map.json`);
  } catch {
    ambiguityMap = null;
  }

  const lemmatizer = createLemmatizer({ lang, wordDict, ambiguityMap });
  loadedLemmatizers.set(lang, lemmatizer);
  return lemmatizer;
}
