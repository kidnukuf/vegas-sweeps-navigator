import { formatClaimCode } from '@shared/claimCode';

export function claimCodeCaret(raw: string, caret: number) {
  const lettersBefore = raw.slice(0, caret).replace(/[^a-z0-9]/gi, '').length;
  return lettersBefore + (lettersBefore >= 3 ? 1 : 0);
}

function restoreCaret(input: HTMLInputElement, position: number) {
  requestAnimationFrame(() => {
    if (input.isConnected && input.ownerDocument.activeElement === input) {
      input.setSelectionRange(position, position);
    }
  });
}

export function updateClaimCodeInput(input: HTMLInputElement, update: (value: string) => void) {
  const position = claimCodeCaret(input.value, input.selectionStart ?? input.value.length);
  update(formatClaimCode(input.value));
  restoreCaret(input, position);
}

/** Skip the generated separator when deleting, so a prefix can always be erased. */
export function backspaceClaimCodeInput(
  event: { key: string; currentTarget: HTMLInputElement; preventDefault: () => void },
  update: (value: string) => void,
) {
  const input = event.currentTarget;
  if (event.key !== 'Backspace' || input.selectionStart !== 4 || input.selectionEnd !== 4 || input.value[3] !== '-') return;
  event.preventDefault();
  update(formatClaimCode(input.value.slice(0, 2) + input.value.slice(4)));
  restoreCaret(input, 2);
}
