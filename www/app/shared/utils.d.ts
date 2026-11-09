interface SharedUtils {
  nextId(): string;
  uid(): string;
}

declare const utils: SharedUtils;
export = utils;
