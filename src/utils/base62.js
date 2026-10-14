// Converts a number into a short Base62 string (0-9, a-z, A-Z) and back.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = ALPHABET.length; // 62

function encode(num) {
  if (num === 0) return ALPHABET[0];
  let str = '';
  while (num > 0) {
    str = ALPHABET[num % BASE] + str;
    num = Math.floor(num / BASE);
  }
  return str;
}

function decode(str) {
  let num = 0;
  for (const ch of str) {
    num = num * BASE + ALPHABET.indexOf(ch);
  }
  return num;
}

module.exports = { encode, decode };
