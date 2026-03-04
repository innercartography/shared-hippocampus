// processor.js — keyword extraction and graph building
// Nodes gain weight from: (1) repeated mentions + (2) number of connections

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'is', 'it', 'its', 'this', 'that', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'can', 'shall', 'not', 'no', 'so', 'if', 'then', 'than', 'too', 'very', 'just',
  'about', 'above', 'after', 'again', 'all', 'also', 'am', 'as', 'because', 'before',
  'between', 'both', 'each', 'few', 'get', 'got', 'he', 'she', 'her', 'him', 'his', 'how',
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'they', 'them', 'their', 'what',
  'which', 'who', 'whom', 'when', 'where', 'why', 'into', 'through', 'during', 'out',
  'up', 'down', 'over', 'under', 'more', 'most', 'other', 'some', 'such', 'only', 'own',
  'same', 'here', 'there', 'these', 'those', 'new', 'old', 'like', 'make', 'many', 'much',
  'need', 'want', 'way', 'well', 'back', 'even', 'give', 'go', 'good', 'great', 'know',
  'let', 'long', 'look', 'made', 'people', 'right', 'say', 'see', 'take', 'tell', 'thing',
  'think', 'time', 'try', 'use', 'used', 'using', 'work', 'world', 'come', 'going', 'really',
  'still', 'every', 'something', 'anything', 'nothing', 'everything', 'one', 'two', 'first',
  'last', 'around', 'part', 'keep', 'being', 'while', 'always', 'never', 'put', 'able'
]);

function extractKeywords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function buildGraph(submissions) {
  const mentionCount = {};  // id -> how many submissions mention this keyword
  const linkSet = {};       // "a|b" -> count of co-occurrences

  for (const sub of submissions) {
    const textKeywords = extractKeywords(sub.idea);
    const tagKeywords = (sub.tags || [])
      .map(t => t.toLowerCase().trim().replace(/[^a-z0-9\-\s]/g, ''))
      .filter(t => t.length > 0);

    const allKeywords = [...new Set([...textKeywords, ...tagKeywords])];

    // Count mentions
    for (const kw of allKeywords) {
      mentionCount[kw] = (mentionCount[kw] || 0) + 1;
    }

    // Count co-occurrences (links)
    for (let i = 0; i < allKeywords.length; i++) {
      for (let j = i + 1; j < allKeywords.length; j++) {
        const a = allKeywords[i];
        const b = allKeywords[j];
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        linkSet[key] = (linkSet[key] || 0) + 1;
      }
    }
  }

  // Count connections per node
  const connectionCount = {};
  for (const key of Object.keys(linkSet)) {
    const [a, b] = key.split('|');
    connectionCount[a] = (connectionCount[a] || 0) + 1;
    connectionCount[b] = (connectionCount[b] || 0) + 1;
  }

  // Build nodes: weight = mentions + connections (so popular hub nodes grow big)
  const nodes = Object.entries(mentionCount).map(([id, mentions]) => {
    const connections = connectionCount[id] || 0;
    return {
      id,
      weight: mentions + connections * 0.5,  // connections boost weight
      mentions,
      connections
    };
  });

  const links = Object.entries(linkSet).map(([key, strength]) => {
    const [source, target] = key.split('|');
    return { source, target, strength };
  });

  return { nodes, links };
}

module.exports = { buildGraph, extractKeywords };
