/** Format a non-negative integer ratio without converting its operands to Number. */
function formatRatio(numerator, denominator, decimals, multiplier = 1n, rounding = 'down', trim = false) {
  numerator = BigInt(numerator);
  denominator = BigInt(denominator);
  if (numerator < 0n || denominator <= 0n || !Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError('Invalid ratio');
  }

  const factor = 10n ** BigInt(decimals);
  const scaledNumerator = numerator * multiplier * factor;
  let quotient = scaledNumerator / denominator;
  if (rounding === 'half-up') {
    if ((scaledNumerator % denominator) * 2n >= denominator) quotient++;
  } else if (rounding !== 'down') {
    throw new RangeError('Invalid rounding mode');
  }

  if (decimals === 0) return quotient.toString();
  const integer = quotient / factor;
  const fraction = (quotient % factor).toString().padStart(decimals, '0');
  const value = `${integer}.${fraction}`;
  return trim ? value.replace(/\.?0+$/, '') : value;
}

function ceilDiv(numerator, denominator) {
  numerator = BigInt(numerator);
  denominator = BigInt(denominator);
  if (numerator < 0n || denominator <= 0n) throw new RangeError('Invalid division');
  return (numerator + denominator - 1n) / denominator;
}

module.exports = { formatRatio, ceilDiv };
