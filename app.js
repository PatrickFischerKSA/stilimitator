import { loadLanguage, setCDN, getLemmatizer } from "./lib/diverse-lemmas.js";

const DEFAULT_RULES = `S -> NP[NUM=?n] VP[NUM=?n]
S -> V[NUM=pl] N V[NUM=pl]
NP[NUM=?n] -> Det[NUM=?n] N[NUM=?n]
VP[NUM=?n] -> V[NUM=?n] NP[]`;

const DEFAULT_VOCAB = `Det[NUM=?n] -> 'the'
N[NUM=sg] -> 'dog' | 'cat' | 'bunny'
N[NUM=pl] -> 'dogs' | 'cats' | 'bunnies'
V[NUM=sg] -> 'chases'
V[NUM=pl] -> 'chase'`;

const STOPWORDS = {
  English: new Set([
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "for", "from", "had", "has", "have",
    "he", "her", "hers", "him", "his", "i", "if", "in", "into", "is", "it", "its", "me", "my", "of", "on", "or",
    "our", "ours", "she", "so", "that", "the", "their", "theirs", "them", "they", "this", "those", "to", "was",
    "we", "were", "what", "when", "where", "which", "who", "why", "will", "with", "you", "your", "yours"
  ]),
  Deutsch: new Set([
    "aber", "als", "am", "an", "auch", "auf", "aus", "bei", "bin", "bis", "bist", "da", "dadurch", "daher", "darum",
    "das", "daß", "dass", "dein", "deine", "dem", "den", "der", "des", "dessen", "deshalb", "die", "dies", "dieser",
    "dieses", "doch", "dort", "du", "durch", "ein", "eine", "einem", "einen", "einer", "eines", "er", "es", "euer",
    "eure", "für", "hatte", "hatten", "hattest", "hattet", "hier", "hinter", "ich", "ihr", "ihre", "im", "in",
    "ist", "ja", "jede", "jedem", "jeden", "jeder", "jedes", "jener", "jenes", "jetzt", "kann", "kannst", "können",
    "könnt", "machen", "mein", "meine", "mit", "muß", "mußt", "musst", "müssen", "müßt", "nach", "nachdem", "nein",
    "nicht", "nun", "oder", "seid", "sein", "seine", "sich", "sie", "sind", "soll", "sollen", "sollst", "sollt",
    "sonst", "soweit", "sowie", "und", "unser", "unsere", "unter", "vom", "von", "vor", "wann", "warum", "was",
    "weiter", "weitere", "wenn", "wer", "werde", "werden", "werdet", "weshalb", "wie", "wieder", "wieso", "wir",
    "wird", "wirst", "wo", "zu", "zum", "zur", "über"
  ]),
  Français: new Set([
    "a", "à", "ai", "ait", "au", "aux", "avec", "ce", "ces", "dans", "de", "des", "du", "elle", "en", "et", "eux",
    "il", "ils", "je", "la", "le", "les", "leur", "lui", "ma", "mais", "me", "même", "mes", "moi", "mon", "ne",
    "nos", "notre", "nous", "on", "ou", "par", "pas", "pour", "qu", "que", "qui", "sa", "se", "ses", "son", "sur",
    "ta", "te", "tes", "toi", "ton", "tu", "un", "une", "vos", "votre", "vous", "c", "d", "j", "l", "à", "m", "n",
    "s", "t", "y", "été", "étée", "étées", "étés", "étant", "suis", "es", "est", "sommes", "êtes", "sont"
  ]),
  Italiano: new Set([
    "a", "ad", "al", "alla", "allo", "ai", "agli", "all", "agl", "anche", "avere", "ben", "che", "chi", "ci",
    "come", "con", "contro", "cui", "da", "dal", "dalla", "dallo", "dai", "dagli", "dei", "del", "della", "dello",
    "dentro", "di", "dopo", "dove", "e", "ed", "era", "erano", "essere", "fa", "fare", "fra", "gli", "ha", "hai",
    "hanno", "ho", "i", "il", "in", "io", "la", "le", "lei", "li", "lo", "loro", "ma", "mi", "mia", "mie", "mio",
    "nei", "nel", "nella", "nello", "noi", "non", "o", "per", "perché", "più", "quale", "quanta", "quante", "quanti",
    "quanto", "quella", "quelle", "quelli", "quello", "questa", "queste", "questi", "questo", "sarà", "se", "sei",
    "senza", "si", "sia", "siamo", "siete", "solo", "sono", "sta", "sto", "su", "sua", "sue", "sugli", "sul", "sulla",
    "sullo", "tra", "tu", "tua", "tue", "tuo", "un", "una", "uno", "vi", "voi"
  ])
};

const DEFAULT_STOPWORDS = Object.fromEntries(
  Object.entries(STOPWORDS).map(([language, stopwords]) => [language, [...stopwords]])
);

const ANNA_CORPORA = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const CORPUS_LABELS = Object.fromEntries(ANNA_CORPORA.map((key) => [key, key.toUpperCase()]));

const annaState = {
  activeTab: "a",
  corpora: Object.fromEntries(
    ANNA_CORPORA.map((corpusKey) => [corpusKey, {
      analysis: null,
      lastSearchTerm: "",
      lastSearchLemma: "",
      lastSearchStats: null,
      ngramFilter: ""
    }])
  ),
  comparisonSort: {
    keywords: { key: "maxKeyness", direction: "desc" },
    collocates: { key: "combined", direction: "desc" },
    collocatesNoStop: { key: "combined", direction: "desc" }
  },
  ngramSort: Object.fromEntries(
    ANNA_CORPORA.map((corpusKey) => [corpusKey, { key: "frequency", direction: "desc" }])
  ),
  lemmaLoading: new Map()
};

const grammarState = {
  engine: null,
  generatedSentences: []
};

const LEMMA_LANGUAGE_MAP = {
  English: "en",
  Deutsch: "de",
  Français: "fr",
  Italiano: "it"
};

setCDN(new URL("./lemma-data", import.meta.url).href);

function $(id) {
  return document.getElementById(id);
}

function setStatus(id, message) {
  $(id).textContent = message;
}

function formatCounterEntries(entries) {
  return entries.map(([key, value]) => `${key}: ${value}`).join("\n");
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

function formatStopwords(language) {
  return [...(STOPWORDS[language] ?? new Set())]
    .sort((a, b) => a.localeCompare(b))
    .join("\n");
}

function parseStopwordList(text) {
  return [...new Set(
    text
      .split(/[\s,]+/u)
      .map((word) => normalizeApostrophes(word).trim().toLocaleLowerCase())
      .filter(Boolean)
  )];
}

async function extractPdfText(file) {
  const pdfjsLib = await import("./vendor/pdf.min.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";
  const documentTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await documentTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }

  return pages.join("\n\n").trim();
}

async function extractDocxText(file) {
  if (!window.mammoth?.extractRawText) {
    throw new Error("DOCX support library is not available.");
  }
  const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return (result.value || "").trim();
}

async function extractLegacyDocText(file) {
  const buffer = await file.arrayBuffer();
  const decoded = new TextDecoder("windows-1252").decode(buffer);
  const chunks = decoded
    .replace(/\r/g, "\n")
    .split(/[^\t\n\r\u0020-\u007e\u00a0-\u00ff]+/u)
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter((chunk) => chunk.length > 2 && /[A-Za-zÀ-ÿ]/u.test(chunk));
  return chunks.join("\n").trim();
}

async function extractUploadedText(file) {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase() || "";
  const type = file.type;

  if (extension === "pdf" || type === "application/pdf") {
    return extractPdfText(file);
  }
  if (extension === "docx" || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocxText(file);
  }
  if (extension === "doc" || type === "application/msword") {
    return extractLegacyDocText(file);
  }
  if (extension === "txt" || type.startsWith("text/")) {
    return file.text();
  }

  throw new Error("Unsupported file type.");
}

function getCorpusElements(corpusKey) {
  return {
    language: $(`anna-${corpusKey}-language`),
    file: $(`anna-${corpusKey}-file`),
    input: $(`anna-${corpusKey}-input`),
    analyze: $(`anna-${corpusKey}-analyze`),
    clear: $(`anna-${corpusKey}-clear`),
    status: $(`anna-${corpusKey}-status`),
    summary: $(`anna-${corpusKey}-summary`),
    freqAll: $(`anna-${corpusKey}-freq-all`),
    freqNoStop: $(`anna-${corpusKey}-freq-nostop`),
    searchTerm: $(`anna-${corpusKey}-search-term`),
    search: $(`anna-${corpusKey}-search`),
    lemmaSummary: $(`anna-${corpusKey}-lemma-summary`),
    collocates: $(`anna-${corpusKey}-collocates`),
    collocatesNoStop: $(`anna-${corpusKey}-collocates-nostop`),
    kwicBody: $(`anna-${corpusKey}-kwic-body`),
    kwicBar: $(`anna-${corpusKey}-kwic-bar`),
    kwicCaption: $(`anna-${corpusKey}-kwic-caption`),
    ngramFilter: $(`anna-${corpusKey}-ngram-filter`),
    ngramBody: $(`anna-${corpusKey}-ngram-body`),
    stopwords: $(`anna-${corpusKey}-stopwords`),
    stopwordsUpdate: $(`anna-${corpusKey}-stopwords-update`),
    stopwordsReset: $(`anna-${corpusKey}-stopwords-reset`),
    stopwordsStatus: $(`anna-${corpusKey}-stopwords-status`)
  };
}

function getCorpusState(corpusKey) {
  return annaState.corpora[corpusKey];
}

function refreshStopwordEditor(corpusKey) {
  const elements = getCorpusElements(corpusKey);
  elements.stopwords.value = formatStopwords(elements.language.value);
}

function refreshAllStopwordEditors() {
  ANNA_CORPORA.forEach(refreshStopwordEditor);
}

function splitSentences(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const matches = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return matches ? matches.map((segment) => segment.trim()).filter(Boolean) : [normalized];
}

function extractTokens(text) {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    return [...segmenter.segment(text)]
      .filter(({ segment }) => segment.trim())
      .map(({ segment, isWordLike }) => ({
        token: segment,
        isWordLike: Boolean(isWordLike)
      }));
  }

  return Array.from(
    text.matchAll(/(?:\p{L}[\p{L}\p{M}\p{N}'’_-]*|\p{N}+|[^\s])/gu),
    (match) => ({
      token: match[0],
      isWordLike: /[\p{L}\p{N}]/u.test(match[0])
    })
  );
}

function normalizeApostrophes(text) {
  return text.replace(/[’']/g, "'");
}

function lemmatizeToken(token, language) {
  const lower = normalizeApostrophes(token).toLocaleLowerCase();

  if (language === "English") {
    if (lower.endsWith("ies") && lower.length > 4) return `${lower.slice(0, -3)}y`;
    if (lower.endsWith("ing") && lower.length > 5) return lower.slice(0, -3);
    if (lower.endsWith("ed") && lower.length > 4) return lower.slice(0, -2);
    if (lower.endsWith("es") && lower.length > 4) return lower.slice(0, -2);
    if (lower.endsWith("s") && lower.length > 3) return lower.slice(0, -1);
    return lower;
  }

  if (language === "Deutsch") {
    if (lower.endsWith("innen") && lower.length > 6) return lower.slice(0, -5);
    if (lower.endsWith("ern") && lower.length > 5) return lower.slice(0, -3);
    if (lower.endsWith("en") && lower.length > 4) return lower.slice(0, -2);
    if (lower.endsWith("e") && lower.length > 4) return lower.slice(0, -1);
    return lower;
  }

  if (language === "Français") {
    if (lower.endsWith("aux") && lower.length > 4) return `${lower.slice(0, -3)}al`;
    if (lower.endsWith("ées") && lower.length > 4) return lower.slice(0, -1);
    if (lower.endsWith("s") && lower.length > 3) return lower.slice(0, -1);
    return lower;
  }

  if (language === "Italiano") {
    if (lower.endsWith("zioni") && lower.length > 6) return `${lower.slice(0, -5)}zione`;
    if (lower.endsWith("mente") && lower.length > 7) return lower.slice(0, -5);
    if (lower.endsWith("i") && lower.length > 4) return lower.slice(0, -1);
    if (lower.endsWith("e") && lower.length > 4) return lower.slice(0, -1);
    return lower;
  }

  return lower;
}

async function getLanguageLemmatizer(language) {
  const langCode = LEMMA_LANGUAGE_MAP[language];
  if (!langCode) {
    return null;
  }

  const cached = getLemmatizer(langCode);
  if (cached) {
    return cached;
  }

  if (annaState.lemmaLoading.has(langCode)) {
    return annaState.lemmaLoading.get(langCode);
  }

  const loadingPromise = loadLanguage(langCode)
    .catch((error) => {
      annaState.lemmaLoading.delete(langCode);
      throw error;
    });

  annaState.lemmaLoading.set(langCode, loadingPromise);
  const loaded = await loadingPromise;
  annaState.lemmaLoading.delete(langCode);
  return loaded;
}

async function lemmatizeWordsWithFallback(tokens, language) {
  try {
    const lemmatizer = await getLanguageLemmatizer(language);
    if (!lemmatizer) {
      return tokens.map((token) => lemmatizeToken(token, language));
    }

    return tokens.map((token) => {
      const entry = lemmatizer.lemmatizeWord(token);
      const directLemma = entry.lemmas[0];

      if (entry.method === "direct" && directLemma) {
        return directLemma;
      }

      // Some dictionaries, especially German, preserve capitalized forms.
      const alternateForms = [
        token.normalize("NFC"),
        token.toLocaleLowerCase(),
        token.charAt(0).toLocaleUpperCase() + token.slice(1).toLocaleLowerCase()
      ];

      for (const form of alternateForms) {
        const alternateLemma = lemmatizer.wordDict?.[form];
        if (alternateLemma) {
          return alternateLemma;
        }
      }

      return directLemma ?? lemmatizeToken(token, language);
    });
  } catch (error) {
    console.warn(`Falling back to heuristic lemmatization for ${language}:`, error);
    return tokens.map((token) => lemmatizeToken(token, language));
  }
}

function isStopword(token, language) {
  const stopwords = STOPWORDS[language] ?? new Set();
  return stopwords.has(normalizeApostrophes(token).toLocaleLowerCase());
}

function countCharactersExcludingPunctuation(text) {
  const withoutPunctuation = text.replace(/[^\p{L}\p{N}\s]/gu, "");
  return withoutPunctuation.replace(/\s/g, "").length;
}

function toCounter(entries) {
  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function toCountMap(entries) {
  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }
  return counts;
}

function computeNgramRows(tokens, minLength = 3, maxLength = 6, minFrequency = 4) {
  const counts = new Map();

  for (let n = minLength; n <= maxLength; n += 1) {
    for (let index = 0; index <= tokens.length - n; index += 1) {
      const ngram = tokens.slice(index, index + n).join(" ");
      counts.set(ngram, (counts.get(ngram) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, frequency]) => frequency >= minFrequency)
    .map(([ngram, frequency]) => ({
      ngram,
      frequency,
      length: ngram.split(" ").length
    }));
}

async function analyzeText(text, language) {
  const sentences = splitSentences(text);
  const tokenEntries = extractTokens(text);
  const allTokens = tokenEntries.map(({ token }) => token);
  const wordLikeTokens = tokenEntries
    .filter(({ isWordLike }) => isWordLike)
    .map(({ token }) => token);
  const lemmatizedWordTokens = await lemmatizeWordsWithFallback(wordLikeTokens, language);
  let wordLikeIndex = 0;
  const allLemmas = tokenEntries.map(({ token, isWordLike }) => {
    if (!isWordLike) {
      return normalizeApostrophes(token).toLocaleLowerCase();
    }

    const lemma = lemmatizedWordTokens[wordLikeIndex];
    wordLikeIndex += 1;
    return lemma;
  });
  const normalizedTokens = allTokens.map((token) => normalizeApostrophes(token).toLocaleLowerCase());

  const lemmaList = allLemmas.filter(Boolean);
  const lemmaListNoStop = allTokens
    .map((token, index) => ({
      token,
      lemma: allLemmas[index],
      isWordLike: tokenEntries[index].isWordLike
    }))
    .filter(({ token, isWordLike }) => !isWordLike || !isStopword(token, language))
    .map(({ lemma }) => lemma);

  const charCount = countCharactersExcludingPunctuation(text);
  const wordCount = allTokens.length;
  const fullLemmaCounter = toCounter(lemmaList);
  const sortedLemmaCounter = fullLemmaCounter.slice(0, 100);
  const sortedLemmaNoStopCounter = toCounter(lemmaListNoStop).slice(0, 100);
  const typeTokenRatio = wordCount ? Number((fullLemmaCounter.length / wordCount).toFixed(4)) : 0;

  return {
    results: {
      char_count: charCount,
      word_count: wordCount,
      unique_lemmas: fullLemmaCounter.length,
      type_token_ratio: typeTokenRatio,
      sent_count: sentences.length,
      avg_char_per_word: wordCount ? Number((charCount / wordCount).toFixed(2)) : 0,
      avg_word_per_sent: sentences.length ? Number((wordCount / sentences.length).toFixed(2)) : 0,
      sorted_lemma_counter: sortedLemmaCounter,
      sorted_lemma_nostop_counter: sortedLemmaNoStopCounter
    },
    allLemmas,
    allTokens,
    normalizedTokens,
    tokenEntries,
    ngrams: computeNgramRows(allTokens),
    language,
    lemmaCounts: toCountMap(lemmaList)
  };
}

async function normalizeSearchTerm(searchTerm, language, analysis = null) {
  const normalizedInput = normalizeApostrophes(searchTerm).toLocaleLowerCase();
  const hasWordCharacters = /[\p{L}\p{N}]/u.test(searchTerm);

  if (!hasWordCharacters) {
    return normalizedInput;
  }

  if (analysis) {
    const lemmaCandidates = new Map();
    analysis.normalizedTokens.forEach((token, index) => {
      if (token !== normalizedInput) {
        return;
      }

      const lemma = analysis.allLemmas[index];
      if (!lemma) {
        return;
      }

      lemmaCandidates.set(lemma, (lemmaCandidates.get(lemma) ?? 0) + 1);
    });

    if (lemmaCandidates.size > 0) {
      return [...lemmaCandidates.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0];
    }

    if (analysis.lemmaCounts.has(normalizedInput)) {
      return normalizedInput;
    }
  }

  const [normalized] = await lemmatizeWordsWithFallback([searchTerm], language);
  if (analysis && normalizedInput !== normalized && analysis.lemmaCounts.has(normalizedInput) && !analysis.lemmaCounts.has(normalized)) {
    return normalizedInput;
  }
  return normalized;
}

function computeLemmaStats(analysis, searchLemma) {
  const { results, allLemmas, allTokens, language, tokenEntries } = analysis;
  const collocationWindowSize = 5;
  const indices = [];

  allLemmas.forEach((lemma, index) => {
    if (lemma === searchLemma) {
      indices.push(index);
    }
  });

  const collocates = [];
  const collocatesNoStop = [];
  for (const index of indices) {
    const start = Math.max(0, index - collocationWindowSize);
    const end = Math.min(allLemmas.length, index + collocationWindowSize + 1);

    for (let contextIndex = start; contextIndex < end; contextIndex += 1) {
      if (contextIndex === index) {
        continue;
      }

      const wordForm = normalizeApostrophes(allTokens[contextIndex]).toLocaleLowerCase();
      collocates.push(wordForm);

      if (!tokenEntries[contextIndex].isWordLike || !isStopword(allTokens[contextIndex], language)) {
        collocatesNoStop.push(wordForm);
      }
    }
  }

  const kwic = indices.map((index) => {
    const left = allTokens.slice(Math.max(0, index - 10), index);
    const right = allTokens.slice(index + 1, index + 11);
    return {
      left,
      keyword: allTokens[index],
      right
    };
  });

  return {
    search_lemma: searchLemma,
    search_term_occurrences: indices.length,
    search_term_frequency: results.word_count ? Number(((indices.length / results.word_count) * 100).toFixed(4)) : 0,
    hit_indices: indices,
    total_tokens: allTokens.length,
    collocate_counts: toCounter(collocates),
    collocate_nostop_counts: toCounter(collocatesNoStop),
    total_collocates: collocates.length,
    total_collocates_nostop: collocatesNoStop.length,
    top_collocates: toCounter(collocates).slice(0, 50),
    top_collocates_nostop: toCounter(collocatesNoStop).slice(0, 50),
    kwic
  };
}

function formatAnnaSummary(results) {
  return `Number of characters in the text: ${results.char_count}
Number of words in the text: ${results.word_count}
Number of unique lemmas in the text: ${results.unique_lemmas}
Number of sentences in the text: ${results.sent_count}
Average word length: ${results.avg_char_per_word} characters
Average sentence length: ${results.avg_word_per_sent} words`;
}

function renderCorpusAnalysis(corpusKey) {
  const state = getCorpusState(corpusKey);
  const elements = getCorpusElements(corpusKey);
  const { results } = state.analysis;

  elements.summary.value = formatAnnaSummary(results);
  elements.freqAll.value = formatCounterEntries(results.sorted_lemma_counter);
  elements.freqNoStop.value = formatCounterEntries(results.sorted_lemma_nostop_counter);
  renderNgramTable(corpusKey);
}

function renderCorpusLemmaStats(corpusKey, stats) {
  const elements = getCorpusElements(corpusKey);
  elements.lemmaSummary.value = `Number of occurrences of the search term in the text: ${stats.search_term_occurrences}
The search term makes up ${stats.search_term_frequency}% of the text`;
  elements.collocates.value = formatCounterEntries(stats.top_collocates);
  elements.collocatesNoStop.value = formatCounterEntries(stats.top_collocates_nostop);
  elements.kwicBody.innerHTML = stats.kwic.length
    ? stats.kwic.map((line, index) => `<tr><td class="kwic-index">${index + 1}.</td><td class="kwic-left">${line.left.join(" ")}</td><td class="kwic-keyword"><strong>${line.keyword}</strong></td><td class="kwic-right">${line.right.join(" ")}</td></tr>`).join("")
    : `<tr><td colspan="4">No KWIC rows found for this search term.</td></tr>`;
  elements.kwicBar.innerHTML = stats.hit_indices.length
    ? stats.hit_indices.map((index) => {
      const leftPercent = stats.total_tokens > 1 ? (index / (stats.total_tokens - 1)) * 100 : 0;
      return `<span class="kwic-position-marker" style="left: ${leftPercent}%;" title="Token ${index + 1}"></span>`;
    }).join("")
    : "";
  elements.kwicCaption.textContent = stats.hit_indices.length
    ? `${stats.hit_indices.length} hit${stats.hit_indices.length === 1 ? "" : "s"} across ${stats.total_tokens} token${stats.total_tokens === 1 ? "" : "s"}.`
    : "No hit positions found for this search term.";
}

function clearCorpusOutputs(corpusKey) {
  const elements = getCorpusElements(corpusKey);
  [
    elements.input,
    elements.summary,
    elements.freqAll,
    elements.freqNoStop,
    elements.searchTerm,
    elements.lemmaSummary,
    elements.collocates,
    elements.collocatesNoStop
  ].forEach((field) => {
    field.value = "";
  });
  elements.kwicBody.innerHTML = `<tr><td colspan="4">Run a lemma search to see KWIC rows.</td></tr>`;
  elements.kwicBar.innerHTML = "";
  elements.kwicCaption.textContent = "Run a lemma search to see hit positions across the text.";
  elements.ngramBody.innerHTML = `<tr><td colspan="3">Analyze corpus ${corpusKey.toUpperCase()} to see repeated n-grams.</td></tr>`;
  elements.ngramFilter.value = "";
}

function clearCorpusLemmaOutputs(corpusKey) {
  const elements = getCorpusElements(corpusKey);
  [
    elements.lemmaSummary,
    elements.collocates,
    elements.collocatesNoStop
  ].forEach((field) => {
    field.value = "";
  });
  elements.kwicBody.innerHTML = `<tr><td colspan="4">Run a lemma search to see KWIC rows.</td></tr>`;
  elements.kwicBar.innerHTML = "";
  elements.kwicCaption.textContent = "Run a lemma search to see hit positions across the text.";
}

function renderNgramTable(corpusKey) {
  const state = getCorpusState(corpusKey);
  const elements = getCorpusElements(corpusKey);

  if (!state.analysis) {
    elements.ngramBody.innerHTML = `<tr><td colspan="3">Analyze corpus ${corpusKey.toUpperCase()} to see repeated n-grams.</td></tr>`;
    return;
  }

  const filterValue = state.ngramFilter.trim().toLocaleLowerCase();
  const rows = state.analysis.ngrams
    .filter((row) => !filterValue || row.ngram.toLocaleLowerCase().includes(filterValue));
  const sortConfig = annaState.ngramSort[corpusKey];
  const directionFactor = sortConfig.direction === "asc" ? 1 : -1;
  const sorted = [...rows].sort((left, right) => {
    const primary = compareValues(left[sortConfig.key], right[sortConfig.key]);
    if (primary !== 0) {
      return primary * directionFactor;
    }
    return left.ngram.localeCompare(right.ngram);
  });

  elements.ngramBody.innerHTML = sorted.length
    ? sorted.map((row) => `<tr><td>${row.ngram}</td><td>${row.frequency}</td><td>${row.length}</td></tr>`).join("")
    : `<tr><td colspan="3">No n-grams matched the current filter.</td></tr>`;
}

function setTableHeader(tableId, cells) {
  const headerRow = $(`${tableId}`).querySelector("thead tr");
  headerRow.innerHTML = cells.map((cell) => `<th scope="col">${cell}</th>`).join("");
}

function analyzedCorpora() {
  return ANNA_CORPORA
    .map((corpusKey) => ({ key: corpusKey, label: CORPUS_LABELS[corpusKey], analysis: getCorpusState(corpusKey).analysis }))
    .filter((corpus) => corpus.analysis);
}

function setComparisonPlaceholder(statusMessage, keywordMessage, collocateMessage) {
  $("anna-compare-status").textContent = statusMessage;
  setTableHeader("anna-compare-summary-table", ["Measure", ...ANNA_CORPORA.map((corpusKey) => CORPUS_LABELS[corpusKey])]);
  setTableHeader("anna-keyword-table", [
    `<button class="sort-button" data-table="keywords" data-sort-key="lemma" type="button">Lemma</button>`,
    ...ANNA_CORPORA.flatMap((corpusKey) => [
      `<button class="sort-button" data-table="keywords" data-sort-key="freq-${corpusKey}" type="button">Freq ${CORPUS_LABELS[corpusKey]}</button>`,
      `<button class="sort-button" data-table="keywords" data-sort-key="rel-${corpusKey}" type="button">Rel % ${CORPUS_LABELS[corpusKey]}</button>`
    ]),
    `<button class="sort-button" data-table="keywords" data-sort-key="maxKeyness" type="button">Keyness</button>`
  ]);
  setTableHeader("anna-collocate-table", [
    `<button class="sort-button" data-table="collocates" data-sort-key="lemma" type="button">Collocate</button>`,
    ...ANNA_CORPORA.flatMap((corpusKey) => [
      `<button class="sort-button" data-table="collocates" data-sort-key="freq-${corpusKey}" type="button">Freq ${CORPUS_LABELS[corpusKey]}</button>`,
      `<button class="sort-button" data-table="collocates" data-sort-key="rel-${corpusKey}" type="button">Rel % ${CORPUS_LABELS[corpusKey]}</button>`
    ])
  ]);
  setTableHeader("anna-collocate-nostop-table", [
    `<button class="sort-button" data-table="collocatesNoStop" data-sort-key="lemma" type="button">Collocate</button>`,
    ...ANNA_CORPORA.flatMap((corpusKey) => [
      `<button class="sort-button" data-table="collocatesNoStop" data-sort-key="freq-${corpusKey}" type="button">Freq ${CORPUS_LABELS[corpusKey]}</button>`,
      `<button class="sort-button" data-table="collocatesNoStop" data-sort-key="rel-${corpusKey}" type="button">Rel % ${CORPUS_LABELS[corpusKey]}</button>`
    ])
  ]);
  $("anna-compare-summary-body").innerHTML = `<tr><td colspan="${ANNA_CORPORA.length + 1}">${statusMessage}</td></tr>`;
  $("anna-keyword-body").innerHTML = `<tr><td colspan="${(ANNA_CORPORA.length * 2) + 2}">${keywordMessage}</td></tr>`;
  $("anna-collocate-body").innerHTML = `<tr><td colspan="${(ANNA_CORPORA.length * 2) + 1}">${collocateMessage}</td></tr>`;
  $("anna-collocate-nostop-body").innerHTML = `<tr><td colspan="${(ANNA_CORPORA.length * 2) + 1}">${collocateMessage}</td></tr>`;
  $("anna-compare-lemma").value = "";
  wireSortButtons();
  refreshSortIndicators();
}

function computeLogLikelihood(countA, countB, totalA, totalB) {
  const combined = countA + countB;
  const grandTotal = totalA + totalB;

  if (!combined || !grandTotal || !totalA || !totalB) {
    return 0;
  }

  const expectedA = (totalA * combined) / grandTotal;
  const expectedB = (totalB * combined) / grandTotal;
  let score = 0;

  if (countA > 0 && expectedA > 0) {
    score += countA * Math.log(countA / expectedA);
  }
  if (countB > 0 && expectedB > 0) {
    score += countB * Math.log(countB / expectedB);
  }

  const logLikelihood = 2 * score;
  const relativeA = totalA ? countA / totalA : 0;
  const relativeB = totalB ? countB / totalB : 0;

  if (relativeA === relativeB) {
    return 0;
  }

  return relativeA > relativeB ? logLikelihood : -logLikelihood;
}

function compareValues(left, right) {
  if (left === undefined || left === null) {
    return right === undefined || right === null ? 0 : -1;
  }
  if (right === undefined || right === null) {
    return 1;
  }
  if (typeof left === "string" && typeof right === "string") {
    return left.localeCompare(right);
  }
  return left - right;
}

function sortRows(rows, config) {
  const directionFactor = config.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const primary = compareValues(left[config.key], right[config.key]);
    if (primary !== 0) {
      return primary * directionFactor;
    }
    return left.lemma.localeCompare(right.lemma);
  });
}

function renderSummaryComparison(corpora) {
  setTableHeader("anna-compare-summary-table", ["Measure", ...corpora.map((corpus) => corpus.label)]);
  const rows = [
    ["Characters", (analysis) => analysis.results.char_count],
    ["Words (tokens)", (analysis) => analysis.results.word_count],
    ["Unique lemmas (types)", (analysis) => analysis.results.unique_lemmas],
    ["Type/token ratio", (analysis) => formatNumber(analysis.results.type_token_ratio, 4)],
    ["Sentences", (analysis) => analysis.results.sent_count],
    ["Average word length", (analysis) => formatNumber(analysis.results.avg_char_per_word)],
    ["Average sentence length", (analysis) => formatNumber(analysis.results.avg_word_per_sent)]
  ];

  $("anna-compare-summary-body").innerHTML = rows
    .map(([label, getValue]) => `<tr><td>${label}</td>${corpora.map((corpus) => `<td>${getValue(corpus.analysis)}</td>`).join("")}</tr>`)
    .join("");
}

function buildKeywordRows(corpora) {
  const lemmaSet = new Set(corpora.flatMap((corpus) => [...corpus.analysis.lemmaCounts.keys()]));
  const rows = [];

  lemmaSet.forEach((lemma) => {
    const row = { lemma, maxKeyness: 0 };
    corpora.forEach((corpus) => {
      const freq = corpus.analysis.lemmaCounts.get(lemma) ?? 0;
      const rel = corpus.analysis.results.word_count ? (freq / corpus.analysis.results.word_count) * 100 : 0;
      const otherFreq = corpora.reduce((sum, other) => sum + (other.key === corpus.key ? 0 : (other.analysis.lemmaCounts.get(lemma) ?? 0)), 0);
      const otherTotal = corpora.reduce((sum, other) => sum + (other.key === corpus.key ? 0 : other.analysis.results.word_count), 0);
      const keyness = computeLogLikelihood(freq, otherFreq, corpus.analysis.results.word_count, otherTotal);
      row[`freq-${corpus.key}`] = freq;
      row[`rel-${corpus.key}`] = rel;
      row[`keyness-${corpus.key}`] = keyness;
      row.maxKeyness = Math.max(row.maxKeyness, Math.abs(keyness));
    });
    rows.push(row);
  });

  return rows;
}

function renderKeywordComparison(rows, corpora) {
  setTableHeader("anna-keyword-table", [
    `<button class="sort-button" data-table="keywords" data-sort-key="lemma" type="button">Lemma</button>`,
    ...corpora.flatMap((corpus) => [
      `<button class="sort-button" data-table="keywords" data-sort-key="freq-${corpus.key}" type="button">Freq ${corpus.label}</button>`,
      `<button class="sort-button" data-table="keywords" data-sort-key="rel-${corpus.key}" type="button">Rel % ${corpus.label}</button>`
    ]),
    `<button class="sort-button" data-table="keywords" data-sort-key="maxKeyness" type="button">Keyness</button>`
  ]);
  const sorted = sortRows(rows, annaState.comparisonSort.keywords);
  $("anna-keyword-body").innerHTML = sorted.length
    ? sorted.map((row) => `<tr><td>${row.lemma}</td>${corpora.map((corpus) => `<td>${row[`freq-${corpus.key}`] ?? 0}</td><td>${formatNumber(row[`rel-${corpus.key}`] ?? 0, 4)}</td>`).join("")}<td>${formatNumber(row.maxKeyness, 4)}</td></tr>`).join("")
    : `<tr><td colspan="${(corpora.length * 2) + 2}">No lemma data available.</td></tr>`;
  wireSortButtons();
  refreshSortIndicators();
}

function getComparisonLemma() {
  return getCorpusState("a").lastSearchLemma || "";
}

function getStatsForComparisonCorpus(corpusKey, comparisonLemma) {
  const state = getCorpusState(corpusKey);
  if (!state.analysis || !comparisonLemma) {
    return null;
  }
  if (state.lastSearchLemma === comparisonLemma && state.lastSearchStats) {
    return state.lastSearchStats;
  }
  return computeLemmaStats(state.analysis, comparisonLemma);
}

function buildCollocateRows(statsByCorpus, listKey, totalKey) {
  const collocates = new Set(statsByCorpus.flatMap((entry) => [...new Map(entry.stats[listKey]).keys()]));
  const rows = [];

  collocates.forEach((lemma) => {
    const row = { lemma, combined: 0 };
    statsByCorpus.forEach(({ corpus, stats }) => {
      const top = new Map(stats[listKey]);
      const freq = top.get(lemma) ?? 0;
      row[`freq-${corpus.key}`] = freq;
      row[`rel-${corpus.key}`] = stats[totalKey] ? (freq / stats[totalKey]) * 100 : 0;
      row.combined += freq;
    });
    rows.push(row);
  });

  return rows;
}

function renderCollocateComparison(rows, corpora, sortConfig, tableId, bodyId, emptyMessage = "No collocates found for the compared lemma.") {
  setTableHeader(tableId, [
    `<button class="sort-button" data-table="${tableId === "anna-collocate-table" ? "collocates" : "collocatesNoStop"}" data-sort-key="lemma" type="button">Collocate</button>`,
    ...corpora.flatMap((corpus) => [
      `<button class="sort-button" data-table="${tableId === "anna-collocate-table" ? "collocates" : "collocatesNoStop"}" data-sort-key="freq-${corpus.key}" type="button">Freq ${corpus.label}</button>`,
      `<button class="sort-button" data-table="${tableId === "anna-collocate-table" ? "collocates" : "collocatesNoStop"}" data-sort-key="rel-${corpus.key}" type="button">Rel % ${corpus.label}</button>`
    ])
  ]);
  const sorted = sortRows(rows, sortConfig);
  $(bodyId).innerHTML = sorted.length
    ? sorted.map((row) => `<tr><td>${row.lemma}</td>${corpora.map((corpus) => `<td>${row[`freq-${corpus.key}`] ?? 0}</td><td>${formatNumber(row[`rel-${corpus.key}`] ?? 0, 4)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${(corpora.length * 2) + 1}">${emptyMessage}</td></tr>`;
  wireSortButtons();
  refreshSortIndicators();
}

function refreshComparisonView() {
  const corpora = analyzedCorpora();

  if (corpora.length < 2) {
    setComparisonPlaceholder(
      "Analyze at least two corpora to populate the comparison view.",
      "Analyze at least two corpora to compare keyword profiles.",
      "Search for a lemma in corpus A to compare collocates."
    );
    return;
  }

  $("anna-compare-status").textContent = "Comparison view is up to date.";
  renderSummaryComparison(corpora);
  renderKeywordComparison(buildKeywordRows(corpora), corpora);

  const comparisonLemma = getComparisonLemma();
  $("anna-compare-lemma").value = getCorpusState("a").lastSearchTerm;

  if (!comparisonLemma) {
    $("anna-collocate-body").innerHTML = `<tr><td colspan="${(corpora.length * 2) + 1}">Search for a lemma in corpus A to compare collocates.</td></tr>`;
    $("anna-collocate-nostop-body").innerHTML = `<tr><td colspan="${(corpora.length * 2) + 1}">Search for a lemma in corpus A to compare collocates without stopwords.</td></tr>`;
    $("anna-compare-status").textContent = "Comparison view is up to date. Collocates follow the lemma searched in corpus A.";
    return;
  }

  const statsByCorpus = corpora
    .map((corpus) => ({ corpus, stats: getStatsForComparisonCorpus(corpus.key, comparisonLemma) }))
    .filter((entry) => entry.stats);

  if (statsByCorpus.length < 2) {
    $("anna-collocate-body").innerHTML = `<tr><td colspan="${(corpora.length * 2) + 1}">Search for a lemma in corpus A to compare collocates.</td></tr>`;
    $("anna-collocate-nostop-body").innerHTML = `<tr><td colspan="${(corpora.length * 2) + 1}">Search for a lemma in corpus A to compare collocates without stopwords.</td></tr>`;
    return;
  }

  $("anna-compare-status").textContent = `Comparison view is up to date. Collocates follow corpus A's searched term "${getCorpusState("a").lastSearchTerm}".`;

  renderCollocateComparison(
    buildCollocateRows(statsByCorpus, "top_collocates", "total_collocates"),
    statsByCorpus.map((entry) => entry.corpus),
    annaState.comparisonSort.collocates,
    "anna-collocate-table",
    "anna-collocate-body"
  );
  renderCollocateComparison(
    buildCollocateRows(statsByCorpus, "top_collocates_nostop", "total_collocates_nostop"),
    statsByCorpus.map((entry) => entry.corpus),
    annaState.comparisonSort.collocatesNoStop,
    "anna-collocate-nostop-table",
    "anna-collocate-nostop-body",
    "No collocates without stopwords found for the compared lemma."
  );
}

function refreshSortIndicators() {
  document.querySelectorAll(".sort-button").forEach((button) => {
    const table = button.dataset.table;
    const current = annaState.comparisonSort[table]
      ?? (table.startsWith("ngrams-") ? annaState.ngramSort[table.slice(-1)] : null);
    if (!current) {
      return;
    }
    const isActive = current.key === button.dataset.sortKey;
    button.classList.toggle("is-active", isActive);
    button.dataset.sortIndicator = isActive
      ? (current.direction === "asc" ? "▲" : "▼")
      : "";
    button.setAttribute(
      "aria-label",
      isActive
        ? `${button.textContent.trim()}, sorted ${current.direction === "asc" ? "ascending" : "descending"}`
        : `${button.textContent.trim()}, not currently sorted`
    );
  });
}

function wireSortButtons() {
  document.querySelectorAll(".sort-button").forEach((button) => {
    if (button.dataset.sortWired === "true") {
      return;
    }
    button.dataset.sortWired = "true";
    button.addEventListener("click", () => {
      const table = button.dataset.table;
      const sortKey = button.dataset.sortKey;
      const store = table.startsWith("ngrams-") ? annaState.ngramSort : annaState.comparisonSort;
      const storeKey = table.startsWith("ngrams-") ? table.slice(-1) : table;
      const current = store[storeKey];

      store[storeKey] = {
        key: sortKey,
        direction: current.key === sortKey && current.direction === "desc" ? "asc" : "desc"
      };

      refreshSortIndicators();
      if (table.startsWith("ngrams-")) {
        renderNgramTable(storeKey);
      } else {
        refreshComparisonView();
      }
    });
  });
}

function parseCategoryToken(rawToken) {
  const trimmed = rawToken.trim();
  const match = trimmed.match(/^([\p{L}_][\p{L}\p{N}_-]*)(?:\[(.*)\])?$/u);
  if (!match) {
    throw new Error(`Invalid category token: ${trimmed}`);
  }

  const [, name, featurePart] = match;
  const features = {};

  if (featurePart && featurePart.trim()) {
    for (const piece of featurePart.split(",")) {
      const cleanPiece = piece.trim();
      if (!cleanPiece) continue;
      const [key, value] = cleanPiece.split("=");
      if (!key || value === undefined) {
        throw new Error(`Invalid feature specification: ${cleanPiece}`);
      }
      features[key.trim()] = value.trim();
    }
  }

  return {
    type: "nonterminal",
    name,
    features
  };
}

function parseGrammarSymbol(rawToken) {
  const trimmed = rawToken.trim();
  if (!trimmed) {
    return null;
  }

  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith("\"") && trimmed.endsWith("\""))) {
    return {
      type: "terminal",
      value: trimmed.slice(1, -1)
    };
  }

  return parseCategoryToken(trimmed);
}

function tokenizeRhs(rhs) {
  const tokens = [];
  let current = "";
  let quote = null;
  let bracketDepth = 0;

  for (const char of rhs) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      current += char;
      quote = char;
      continue;
    }

    if (char === "[") {
      current += char;
      bracketDepth += 1;
      continue;
    }

    if (char === "]") {
      current += char;
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }

    if (/\s/u.test(char) && bracketDepth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote) {
    throw new Error(`Unclosed quote in grammar alternative: ${rhs}`);
  }

  if (bracketDepth > 0) {
    throw new Error(`Unclosed feature bracket in grammar alternative: ${rhs}`);
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

function cloneEnv(env) {
  return new Map(env);
}

function resolveValue(value, env) {
  let current = value;
  const visited = new Set();
  while (typeof current === "string" && current.startsWith("?") && env.has(current) && !visited.has(current)) {
    visited.add(current);
    current = env.get(current);
  }
  return current;
}

function unifyValue(left, right, env) {
  const resolvedLeft = resolveValue(left, env);
  const resolvedRight = resolveValue(right, env);

  if (resolvedLeft === resolvedRight) {
    return env;
  }

  if (typeof resolvedLeft === "string" && resolvedLeft.startsWith("?")) {
    env.set(resolvedLeft, resolvedRight);
    return env;
  }

  if (typeof resolvedRight === "string" && resolvedRight.startsWith("?")) {
    env.set(resolvedRight, resolvedLeft);
    return env;
  }

  return null;
}

function unifyCategory(categoryA, categoryB, env) {
  if (categoryA.name !== categoryB.name) {
    return null;
  }

  const mergedEnv = cloneEnv(env);
  const keys = new Set([...Object.keys(categoryA.features), ...Object.keys(categoryB.features)]);

  for (const key of keys) {
    const leftValue = categoryA.features[key];
    const rightValue = categoryB.features[key];
    if (leftValue === undefined || rightValue === undefined) {
      continue;
    }
    if (!unifyValue(leftValue, rightValue, mergedEnv)) {
      return null;
    }
  }

  return mergedEnv;
}

function instantiateCategory(category, env) {
  const features = {};
  for (const [key, value] of Object.entries(category.features)) {
    features[key] = resolveValue(value, env);
  }
  return {
    ...category,
    features
  };
}

function renameVariable(value, mapping, suffix) {
  if (typeof value !== "string" || !value.startsWith("?")) {
    return value;
  }

  if (!mapping.has(value)) {
    mapping.set(value, `${value}__${suffix}`);
  }

  return mapping.get(value);
}

function freshenCategoryVariables(category, mapping, suffix) {
  const features = {};
  for (const [key, value] of Object.entries(category.features)) {
    features[key] = renameVariable(value, mapping, suffix);
  }
  return {
    ...category,
    features
  };
}

function freshenRule(rule, suffix) {
  const mapping = new Map();
  return {
    lhs: freshenCategoryVariables(rule.lhs, mapping, suffix),
    rhs: rule.rhs.map((symbol) => {
      if (symbol.type !== "nonterminal") {
        return symbol;
      }
      return freshenCategoryVariables(symbol, mapping, suffix);
    })
  };
}

class GrammarEngine {
  constructor(grammarText) {
    const parsedGrammar = this.parseGrammar(grammarText);
    this.rules = parsedGrammar.rules;
    this.startSymbol = parsedGrammar.startSymbol;
    this.maxDepth = 24;
    this.ruleApplicationId = 0;
    this.lastGenerationLimited = false;
    this.lastGenerationMessage = "";
    this.lexicon = new Set(
      this.rules
        .flatMap((rule) => rule.rhs)
        .filter((symbol) => symbol.type === "terminal")
        .map((symbol) => symbol.value)
    );
  }

  parseGrammar(grammarText) {
    const rules = [];
    let startSymbol = null;
    const lines = grammarText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    for (const line of lines) {
      const pieces = line.split("->");
      if (pieces.length !== 2) {
        throw new Error(`Invalid grammar line: ${line}`);
      }

      const lhs = parseCategoryToken(pieces[0].trim());
      if (!startSymbol) {
        startSymbol = { ...lhs, features: { ...lhs.features } };
      }
      const alternatives = pieces[1].split("|").map((alternative) => alternative.trim());

      for (const alternative of alternatives) {
        const symbols = tokenizeRhs(alternative)
          .map(parseGrammarSymbol)
          .filter(Boolean);
        rules.push({ lhs, rhs: symbols });
      }
    }

    if (!startSymbol) {
      throw new Error("Grammar must contain at least one rule.");
    }

    return { rules, startSymbol };
  }

  collectSentences({ maxSentences = 10000, maxCandidates = maxSentences * 25 } = {}) {
    const start = this.startSymbol;
    const results = [];
    const seen = new Set();
    let candidatesChecked = 0;
    this.generationHitDepthLimit = false;
    this.ruleApplicationId = 0;

    const walk = function* (symbol, env, depth) {
      if (depth > this.maxDepth) {
        this.generationHitDepthLimit = true;
        return;
      }

      if (symbol.type === "terminal") {
        yield { tokens: [symbol.value], tree: symbol.value, env };
        return;
      }

      for (const rule of this.rules) {
        const freshRule = freshenRule(rule, this.ruleApplicationId++);
        const unifiedEnv = unifyCategory(symbol, freshRule.lhs, env);
        if (!unifiedEnv) continue;

        for (const candidate of this.expandSequence(freshRule.rhs, unifiedEnv, depth + 1)) {
          yield {
            tokens: candidate.tokens,
            tree: {
              label: instantiateCategory(freshRule.lhs, candidate.env).name,
              children: candidate.children
            },
            env: candidate.env
          };
        }
      }
    }.bind(this);

    for (const candidate of walk(start, new Map(), 0)) {
      candidatesChecked += 1;
      const sentence = candidate.tokens.join(" ");
      if (!seen.has(sentence)) {
        seen.add(sentence);
        results.push({ sentence, tree: candidate.tree });
      }
      if (results.length >= maxSentences || candidatesChecked >= maxCandidates) {
        break;
      }
    }

    this.lastGenerationLimited = this.generationHitDepthLimit || results.length >= maxSentences || candidatesChecked >= maxCandidates;
    if (results.length >= maxSentences) {
      this.lastGenerationMessage = `Generation stopped after ${maxSentences} unique sentences. The grammar may define more sentences.`;
    } else if (candidatesChecked >= maxCandidates) {
      this.lastGenerationMessage = `Generation stopped after checking ${maxCandidates} derivations. The grammar may define many duplicate or recursive derivations.`;
    } else if (this.generationHitDepthLimit) {
      this.lastGenerationMessage = `Generation stopped at recursion depth ${this.maxDepth}. The grammar may define infinitely many sentences.`;
    } else {
      this.lastGenerationMessage = "";
    }

    return results;
  }

  *expandSequence(symbols, env, depth) {
    if (depth > this.maxDepth) {
      this.generationHitDepthLimit = true;
      return;
    }

    if (symbols.length === 0) {
      yield { tokens: [], children: [], env };
      return;
    }

    const [first, ...rest] = symbols;
    for (const firstResult of this.expandSymbol(first, env, depth)) {
      for (const restResult of this.expandSequence(rest, firstResult.env, depth + 1)) {
        yield {
          tokens: [...firstResult.tokens, ...restResult.tokens],
          children: [firstResult.tree, ...restResult.children],
          env: restResult.env
        };
      }
    }
  }

  *expandSymbol(symbol, env, depth) {
    if (depth > this.maxDepth) {
      this.generationHitDepthLimit = true;
      return;
    }

    if (symbol.type === "terminal") {
      yield { tokens: [symbol.value], tree: symbol.value, env };
      return;
    }

    for (const rule of this.rules) {
      const freshRule = freshenRule(rule, this.ruleApplicationId++);
      const unifiedEnv = unifyCategory(symbol, freshRule.lhs, env);
      if (!unifiedEnv) {
        continue;
      }

      for (const result of this.expandSequence(freshRule.rhs, unifiedEnv, depth + 1)) {
        yield {
          tokens: result.tokens,
          tree: {
            label: instantiateCategory(freshRule.lhs, result.env).name,
            children: result.children
          },
          env: result.env
        };
      }
    }
  }

  parseSentence(sentence) {
    const tokens = sentence.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) {
      return [];
    }

    const start = this.startSymbol;
    this.ruleApplicationId = 0;
    const parses = this.parseSymbol(start, tokens, 0, new Map(), 0)
      .filter((result) => result.nextPosition === tokens.length)
      .map((result) => result.tree);

    const seen = new Set();
    return parses.filter((tree) => {
      const key = JSON.stringify(tree);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  parseSymbol(symbol, tokens, position, env, depth) {
    if (depth > this.maxDepth) {
      return [];
    }

    if (symbol.type === "terminal") {
      if (tokens[position] === symbol.value) {
        return [{
          nextPosition: position + 1,
          tree: symbol.value,
          env
        }];
      }
      return [];
    }

    const results = [];
    for (const rule of this.rules) {
      const freshRule = freshenRule(rule, this.ruleApplicationId++);
      const unifiedEnv = unifyCategory(symbol, freshRule.lhs, env);
      if (!unifiedEnv) continue;

      const sequenceResults = this.parseSequence(freshRule.rhs, tokens, position, unifiedEnv, depth + 1);
      for (const result of sequenceResults) {
        results.push({
          nextPosition: result.nextPosition,
          tree: {
            label: instantiateCategory(freshRule.lhs, result.env).name,
            children: result.children
          },
          env: result.env
        });
      }
    }
    return results;
  }

  parseSequence(symbols, tokens, position, env, depth) {
    if (symbols.length === 0) {
      return [{
        nextPosition: position,
        children: [],
        env
      }];
    }

    const [first, ...rest] = symbols;
    const firstResults = this.parseSymbol(first, tokens, position, env, depth);
    const results = [];

    for (const firstResult of firstResults) {
      const restResults = this.parseSequence(rest, tokens, firstResult.nextPosition, firstResult.env, depth + 1);
      for (const restResult of restResults) {
        results.push({
          nextPosition: restResult.nextPosition,
          children: [firstResult.tree, ...restResult.children],
          env: restResult.env
        });
      }
    }

    return results;
  }
}

function renderTree(tree, prefix = "", isLast = true) {
  if (typeof tree === "string") {
    return `${prefix}${isLast ? "└─" : "├─"} "${tree}"\n`;
  }

  let output = `${prefix}${isLast ? "└─" : "├─"} ${tree.label}\n`;
  const nextPrefix = `${prefix}${isLast ? "   " : "│  "}`;
  tree.children.forEach((child, index) => {
    output += renderTree(child, nextPrefix, index === tree.children.length - 1);
  });
  return output;
}

function formatTree(tree) {
  if (typeof tree === "string") {
    return tree;
  }
  let output = `${tree.label}\n`;
  tree.children.forEach((child, index) => {
    output += renderTree(child, "", index === tree.children.length - 1);
  });
  return output.trimEnd();
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === tabId);
  });
}

function switchAnnaSubtab(tabId) {
  annaState.activeTab = tabId;
  document.querySelectorAll(".anna-subtab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.annaTab === tabId);
  });
  document.querySelectorAll(".anna-subpanel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `anna-subpanel-${tabId}`);
  });
}

function replaceCorpusMarkers(root, fromKey, toKey) {
  const fromLabel = CORPUS_LABELS[fromKey];
  const toLabel = CORPUS_LABELS[toKey];
  const fromLower = fromLabel.toLocaleLowerCase();
  const toLower = toLabel.toLocaleLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    node.nodeValue = node.nodeValue
      .replaceAll(`Corpus ${fromLabel}`, `Corpus ${toLabel}`)
      .replaceAll(`corpus ${fromLabel}`, `corpus ${toLabel}`)
      .replaceAll(`corpus ${fromLower}`, `corpus ${toLower}`)
      .replaceAll(`Analyze corpus ${fromLabel}`, `Analyze corpus ${toLabel}`);
    node = walker.nextNode();
  }

  root.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (attribute.value.includes(`anna-${fromKey}-`) || attribute.value.includes(`corpus ${fromLabel}`) || attribute.value.includes(`corpus ${fromLower}`)) {
        element.setAttribute(
          attribute.name,
          attribute.value
            .replaceAll(`anna-${fromKey}-`, `anna-${toKey}-`)
            .replaceAll(`corpus ${fromLabel}`, `corpus ${toLabel}`)
            .replaceAll(`corpus ${fromLower}`, `corpus ${toLower}`)
        );
      }
    });
  });
}

function createAdditionalCorpusTabs() {
  const switcher = document.querySelector(".subtab-switcher");
  const comparisonButton = document.querySelector('[data-anna-tab="comparison"]');
  const templatePanel = $("anna-subpanel-a");
  const comparisonPanel = $("anna-subpanel-comparison");

  ANNA_CORPORA.slice(2).forEach((corpusKey) => {
    if (!document.querySelector(`[data-anna-tab="${corpusKey}"]`)) {
      const button = document.createElement("button");
      button.className = "anna-subtab-button";
      button.dataset.annaTab = corpusKey;
      button.type = "button";
      button.textContent = CORPUS_LABELS[corpusKey];
      switcher.insertBefore(button, comparisonButton);
    }

    if (!$(`anna-subpanel-${corpusKey}`)) {
      const panel = templatePanel.cloneNode(true);
      panel.id = `anna-subpanel-${corpusKey}`;
      panel.classList.remove("is-active");
      replaceCorpusMarkers(panel, "a", corpusKey);
      comparisonPanel.parentNode.insertBefore(panel, comparisonPanel);
    }
  });
}

function insertCorpusFileInputs() {
  ANNA_CORPORA.forEach((corpusKey) => {
    const input = $(`anna-${corpusKey}-input`);
    if (!input || $(`anna-${corpusKey}-file`)) {
      return;
    }

    const field = document.createElement("label");
    field.className = "field";
    field.innerHTML = `
      <span>Upload Text File</span>
      <input id="anna-${corpusKey}-file" type="file" accept=".doc,.docx,.pdf,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain">
    `;
    input.closest(".field").before(field);
  });
}

function prepareGrammar() {
  const grammarText = `${$("grammar-rules").value.trim()}\n${$("grammar-vocab").value.trim()}`.trim();

  try {
    const engine = new GrammarEngine(grammarText);
    grammarState.engine = engine;
    grammarState.generatedSentences = engine.collectSentences().map((entry) => entry.sentence);
    const limitMessage = engine.lastGenerationMessage ? ` ${engine.lastGenerationMessage}` : "";
    setStatus("grammar-status", `Grammar ready. ${grammarState.generatedSentences.length} valid sentences prepared.${limitMessage}`);
  } catch (error) {
    grammarState.engine = null;
    grammarState.generatedSentences = [];
    setStatus("grammar-status", `Grammar error: ${error.message}`);
  }
}

function initializeAnnaLiza() {
  createAdditionalCorpusTabs();
  insertCorpusFileInputs();
  refreshAllStopwordEditors();
  switchAnnaSubtab("a");
  refreshComparisonView();
  wireSortButtons();
  refreshSortIndicators();

  document.querySelectorAll(".anna-subtab-button").forEach((button) => {
    button.addEventListener("click", () => switchAnnaSubtab(button.dataset.annaTab));
  });

  ANNA_CORPORA.forEach((corpusKey) => {
    const elements = getCorpusElements(corpusKey);
    const state = getCorpusState(corpusKey);

    elements.language.addEventListener("change", () => {
      refreshStopwordEditor(corpusKey);
      elements.stopwordsStatus.textContent = "Showing the stopword list for the selected language.";
    });

    elements.file.addEventListener("change", () => {
      void (async () => {
        const file = elements.file.files?.[0];
        if (!file) {
          return;
        }

        try {
          elements.status.textContent = `Reading ${file.name}...`;
          const text = await extractUploadedText(file);
          if (!text) {
            elements.status.textContent = "No readable text found in the selected file.";
            return;
          }
          elements.input.value = text;
          elements.status.textContent = `${file.name} loaded into the text field.`;
        } catch (error) {
          console.error(error);
          elements.status.textContent = "File upload failed. Please use .docx, .pdf, .doc, or paste the text manually.";
        } finally {
          elements.file.value = "";
        }
      })();
    });

    elements.ngramFilter.addEventListener("input", () => {
      state.ngramFilter = elements.ngramFilter.value;
      renderNgramTable(corpusKey);
    });

    elements.stopwordsUpdate.addEventListener("click", () => {
      const language = elements.language.value;
      const stopwords = parseStopwordList(elements.stopwords.value);
      STOPWORDS[language] = new Set(stopwords);
      refreshAllStopwordEditors();
      elements.stopwordsStatus.textContent = `${stopwords.length} stopwords saved for ${language}. Analyze again to refresh document stats.`;
    });

    elements.stopwordsReset.addEventListener("click", () => {
      const language = elements.language.value;
      const defaults = DEFAULT_STOPWORDS[language] ?? [];
      STOPWORDS[language] = new Set(defaults);
      refreshAllStopwordEditors();
      elements.stopwordsStatus.textContent = `Default stopwords restored for ${language}. Analyze again to refresh document stats.`;
    });

    elements.analyze.addEventListener("click", () => {
      void (async () => {
        const text = elements.input.value.trim();
        const language = elements.language.value;

        if (!text) {
          elements.status.textContent = "Please provide some text first.";
          return;
        }

        try {
          elements.status.textContent = "Loading language resources and analyzing text...";
          state.analysis = await analyzeText(text, language);
          state.lastSearchTerm = "";
          state.lastSearchLemma = "";
          state.lastSearchStats = null;
          clearCorpusLemmaOutputs(corpusKey);
          renderCorpusAnalysis(corpusKey);
          refreshComparisonView();
          elements.status.textContent = "Text stats retrieved successfully.";
        } catch (error) {
          console.error(error);
          elements.status.textContent = "Analysis failed. Check the console for details.";
        }
      })();
    });

    elements.search.addEventListener("click", () => {
      void (async () => {
        if (!state.analysis) {
          elements.status.textContent = "Analyze a text before running lemma search.";
          return;
        }

        const searchTerm = elements.searchTerm.value.trim();
        if (!searchTerm) {
          elements.status.textContent = "Please enter a search term.";
          return;
        }

        try {
          elements.status.textContent = "Normalizing search term...";
          const searchLemma = await normalizeSearchTerm(searchTerm, state.analysis.language, state.analysis);
          const stats = computeLemmaStats(state.analysis, searchLemma);
          state.lastSearchTerm = searchTerm;
          state.lastSearchLemma = searchLemma;
          state.lastSearchStats = stats;
          renderCorpusLemmaStats(corpusKey, stats);
          refreshComparisonView();
          elements.status.textContent = "Word stats retrieved successfully.";
        } catch (error) {
          console.error(error);
          elements.status.textContent = "Lemma lookup failed. Check the console for details.";
        }
      })();
    });

    elements.clear.addEventListener("click", () => {
      state.analysis = null;
      state.lastSearchTerm = "";
      state.lastSearchLemma = "";
      state.lastSearchStats = null;
      state.ngramFilter = "";
      clearCorpusOutputs(corpusKey);
      refreshComparisonView();
      elements.status.textContent = "Ready.";
    });
  });
}

function initializeDGram() {
  $("grammar-rules").value = DEFAULT_RULES;
  $("grammar-vocab").value = DEFAULT_VOCAB;

  $("grammar-update").addEventListener("click", prepareGrammar);

  $("grammar-reset").addEventListener("click", () => {
    $("grammar-rules").value = DEFAULT_RULES;
    $("grammar-vocab").value = DEFAULT_VOCAB;
    prepareGrammar();
  });

  $("grammar-generate-all").addEventListener("click", () => {
    if (!grammarState.engine) {
      prepareGrammar();
    }

    if (!grammarState.engine) {
      $("grammar-generated").value = "Something went wrong. Please check your grammar for errors and update it again.";
      return;
    }

    const isLimited = Boolean(grammarState.engine.lastGenerationMessage);
    const heading = isLimited
      ? "Here are the prepared sentences that are correct:"
      : "Here are all sentences that are correct:";
    const limitMessage = isLimited ? `${grammarState.engine.lastGenerationMessage}\n\n` : "";
    $("grammar-generated").value = `${heading}\n\n${limitMessage}${grammarState.generatedSentences.join("\n")}`;
  });

  $("grammar-check-button").addEventListener("click", () => {
    if (!grammarState.engine) {
      prepareGrammar();
    }

    if (!grammarState.engine) {
      $("grammar-check-output").value = "The grammar contains errors.";
      return;
    }

    const sentence = $("grammar-check-input").value.trim();
    if (!sentence) {
      $("grammar-check-output").value = "Please type a sentence.";
      return;
    }

    const parses = grammarState.engine.parseSentence(sentence);
    const knownWords = sentence.split(/\s+/).every((word) => grammarState.engine.lexicon.has(word));

    if (parses.length > 0) {
      $("grammar-check-output").value = "The sentence is grammatically correct.";
    } else if (!knownWords) {
      $("grammar-check-output").value = "The sentence contains at least one word that I don't know.";
    } else {
      $("grammar-check-output").value = "The sentence is NOT grammatically correct.";
    }
  });

  $("grammar-tree-button").addEventListener("click", () => {
    if (!grammarState.engine) {
      prepareGrammar();
    }

    if (!grammarState.engine) {
      $("grammar-tree-output").value = "The grammar contains errors.";
      return;
    }

    const sentence = $("grammar-tree-input").value.trim();
    if (!sentence) {
      $("grammar-tree-output").value = "Please type a sentence.";
      return;
    }

    const parses = grammarState.engine.parseSentence(sentence);
    if (parses.length === 0) {
      $("grammar-tree-output").value = "It seems that something's off with the sentence. Please check your spelling.";
      return;
    }

    let output = "Here are all valid syntax trees for this sentence:\n";
    parses.forEach((tree, index) => {
      output += `\nThis is syntax tree number ${index + 1}:\n\n${formatTree(tree)}\n`;
    });
    output += `\nThe total number of syntax trees for your sentence is ${parses.length}.`;
    $("grammar-tree-output").value = output.trim();
  });

  $("grammar-poem-button").addEventListener("click", () => {
    if (!grammarState.engine) {
      prepareGrammar();
    }

    if (!grammarState.engine) {
      $("grammar-poem-output").value = "The grammar contains errors.";
      return;
    }

    const verseCount = Number.parseInt($("grammar-poem-count").value, 10);
    if (!Number.isInteger(verseCount) || verseCount < 1) {
      $("grammar-poem-output").value = "Please type a number and click on 'Generate Poem'";
      return;
    }

    if (grammarState.generatedSentences.length < verseCount) {
      $("grammar-poem-output").value = "I can't generate enough unique sentences for your poem. Try fewer lines.";
      return;
    }

    const pool = [...grammarState.generatedSentences];
    const poem = [];
    while (poem.length < verseCount) {
      const index = Math.floor(Math.random() * pool.length);
      poem.push(pool[index]);
      pool.splice(index, 1);
    }
    $("grammar-poem-output").value = poem.join("\n");
  });

  prepareGrammar();
}

function initializeTabs() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
}

initializeTabs();
initializeAnnaLiza();
initializeDGram();
