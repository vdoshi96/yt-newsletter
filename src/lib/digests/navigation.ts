export function getAdjacentArchiveValue(
  selectedValue: string,
  availableValues: string[],
  direction: -1 | 1,
) {
  const sortedValues = [...new Set(availableValues)].sort();

  if (direction < 0) {
    return [...sortedValues].reverse().find((value) => value < selectedValue);
  }

  return sortedValues.find((value) => value > selectedValue);
}
