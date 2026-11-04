/** A row's words as the book states them: the catalogue leaf `key` names, else `authored`. */
export interface BookText {
  readonly authored: string;
  readonly key: string | undefined;
}
