const { compareTwoStrings } = require('string-similarity');
const { CmpStr } = require('cmpstr');

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
  const originalSimilarity = compareTwoStrings(str1, str2);
  const cmpstrSimilarity = cmp.compare('dice', str1, str2);
  console.log(`"${str1}" vs "${str2}":`);
  console.log(`  string-similarity: ${originalSimilarity}`);
  console.log(`  cmpstr (dice):     ${cmpstrSimilarity}`);
  console.log('---');
});