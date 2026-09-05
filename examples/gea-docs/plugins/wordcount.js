export default {
  name: 'wordcount',
  hooks: {
    afterParse(page) {
      let words = 0;
      (function walk(node) {
        if (node.type === 'text') words += node.value.split(/\s+/).filter(Boolean).length;
        (node.children || []).forEach(walk);
      })(page.ast);
      page.wordCount = words;
      return page;
    },
    afterGenerate(ctx) {
      console.log(`[wordcount] generated ${ctx.written.length} file(s)`);
    },
  },
};
