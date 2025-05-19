const { CmpStr } = require('cmpstr');
const { closest } = require('fastest-levenshtein');

const cmp = new CmpStr();

const testPairs = [
  ['hello world', 'hello world'],
  ['hello world', 'hallo world'],
  ['test string', 'tset string'],
  ['apple', 'aple'],
  ['this is a test', 'this is test'],
];

console.log('Comparing string similarity:');
testPairs.forEach(([str1, str2]) => {
  const cmpstrSimilarity = cmp.compare('dice', str1, str2);
  const levenDist = closest(str1, [str2]);
  console.log(`"${str1}" vs "${str2}":`);
  console.log(`  cmpstr (dice):        ${cmpstrSimilarity}`);
  console.log(`  fastest-levenshtein:  ${levenDist === str2 ? 1 : 0}`);
  console.log('---');
});