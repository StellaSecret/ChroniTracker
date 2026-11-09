// Shared utils for multi-condition
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.SharedUtils=factory();
})(typeof self!=='undefined'?self:this, function(){
  function _randomSuffix(){
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 6);
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0].toString(36).slice(0, 6);
    }
    throw new Error('Secure random source unavailable');
  }
  function nextId(){ return Date.now().toString(36)+_randomSuffix(); }
  function uid(){ return nextId(); }
  return {nextId, uid};
});
