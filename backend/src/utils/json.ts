// BigInt를 JSON으로 변환할 때 문자열로 직렬화
// (JSON.stringify가 BigInt 처리 못 하는 문제 해결)
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

export {};
