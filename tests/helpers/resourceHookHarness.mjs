// Deterministic hook state/effects for unit tests; not a browser or React DOM test.
export function createHookHarness() {
  const slots = [];
  let index = 0;
  let pending = [];
  const changed = (old, next) => !old || !next || old.length !== next.length || old.some((value, i) => !Object.is(value, next[i]));
  const react = {
    useState(initial) {
      const position = index++;
      slots[position] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[position].value, update => {
        slots[position].value = typeof update === "function" ? update(slots[position].value) : update;
      }];
    },
    useRef(initial) {
      const position = index++;
      slots[position] ??= { value: { current: initial } };
      return slots[position].value;
    },
    useMemo(factory, deps) {
      const position = index++;
      if (changed(slots[position]?.deps, deps)) slots[position] = { value: factory(), deps };
      return slots[position].value;
    },
    useCallback(callback, deps) {
      return react.useMemo(() => callback, deps);
    },
    useEffect(effect, deps) {
      const position = index++;
      if (changed(slots[position]?.deps, deps)) {
        const previous = slots[position];
        slots[position] = { deps };
        pending.push(() => { previous?.cleanup?.(); slots[position].cleanup = effect(); });
      }
    },
  };
  return {
    react,
    render(fn) { index = 0; return fn(); },
    effects() { const callbacks = pending; pending = []; callbacks.forEach(fn => fn()); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); pending = []; },
  };
}
export const jsx = {
  jsx: (type, props, key) => ({ type, props, key }),
  jsxs: (type, props, key) => ({ type, props, key }),
};
export function findNodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(item => findNodes(item, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...findNodes(tree.props?.children, predicate)];
}
export function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (!tree || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}
