(function (root) {
  const animals = Object.freeze([
    ['fox','🦊','狐狸'], ['rabbit','🐰','兔子'], ['panda','🐼','熊猫'], ['cat','🐱','猫咪'],
    ['frog','🐸','青蛙'], ['bear','🐻','小熊'], ['penguin','🐧','企鹅'], ['dog','🐶','小狗'],
    ['lion','🦁','狮子'], ['pig','🐷','小猪']
  ].map(Object.freeze));
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity:'grapheme'}) : null;

  function validateName(value) {
    const name = typeof value === 'string' ? value.trim().normalize('NFC') : '';
    if (!name || !/[^\p{White_Space}\p{Cf}]/u.test(name)) return {error:'请输入你的名字'};
    if (/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(name)) return {error:'昵称不能包含控制字符'};
    // Also bound unusually large strings made of a single combining cluster.
    if (name.length > 256) return {error:'昵称最多 12 个字符'};
    const length = segmenter ? Array.from(segmenter.segment(name)).length : Array.from(name).length;
    if (length > 12) return {error:'昵称最多 12 个字符'};
    return {name};
  }

  const api = {animals, validateName};
  if (typeof module === 'object' && module.exports) module.exports=api;
  else root.PartyIdentity=api;
})(globalThis);
