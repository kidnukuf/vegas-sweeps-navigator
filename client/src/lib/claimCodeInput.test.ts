import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatClaimCode, normalizeClaimCode } from '@shared/claimCode';
import { backspaceClaimCodeInput, claimCodeCaret, updateClaimCodeInput } from './claimCodeInput';
afterEach(()=>vi.unstubAllGlobals());
describe('Claim code automatic dash',()=>{
 it('inserts the separator as soon as the prefix is entered',()=>{
  expect(['','b','bo','bob','bob7','bob7f3k'].map(formatClaimCode)).toEqual(['','B','BO','BOB-','BOB-7','BOB-7F3K']);
 });
 it('handles dashed, undashed, spaced and Unicode-dash paste',()=>{
  for(const value of ['bob-7f3k','BOB7F3K',' bob 7f3k ','BOB–7F3K'])expect(formatClaimCode(value)).toBe('BOB-7F3K');
 });
 it('never silently truncates longer entries into a different valid code',()=>{
  expect(formatClaimCode('BOB7F3KEXTRA')).toBe('BOB-7F3KEXTRA');
  expect(normalizeClaimCode('BOB-7F3KEXTRA')).toBe('BOB-7F3KEXTRA');
 });
 it('normalizes undashed API entries without stripping invalid characters',()=>{
  expect(normalizeClaimCode(' bob7f3k ')).toBe('BOB-7F3K');
  expect(normalizeClaimCode('BOB–7F3K')).toBe('BOB-7F3K');
  expect(normalizeClaimCode('BOB-7F3K!')).toBe('BOB-7F3K!');
  expect(normalizeClaimCode(undefined)).toBe('');
 });
 it('preserves the logical cursor position across generated dashes',()=>{
  expect(claimCodeCaret('bob',3)).toBe(4);expect(claimCodeCaret('BOB-7F3K',5)).toBe(5);
  expect(claimCodeCaret('BOB7F3K',4)).toBe(5);expect(claimCodeCaret('BO',2)).toBe(2);
 });
 it('allows Backspace to erase the generated prefix instead of getting stuck at the dash',()=>{
  vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>{fn();return 1});
  const input:any={value:'BOB-',selectionStart:4,selectionEnd:4,isConnected:true,setSelectionRange:vi.fn(),ownerDocument:{}};input.ownerDocument.activeElement=input;
  const update=vi.fn(),preventDefault=vi.fn();backspaceClaimCodeInput({key:'Backspace',currentTarget:input,preventDefault},update);
  expect(update).toHaveBeenCalledWith('BO');expect(preventDefault).toHaveBeenCalled();expect(input.setSelectionRange).toHaveBeenCalledWith(2,2);
 });
 it('formats changes and restores the caret only to the active input',()=>{
  vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>{fn();return 1});
  const input:any={value:'bob7f3k',selectionStart:4,isConnected:true,setSelectionRange:vi.fn(),ownerDocument:{}};input.ownerDocument.activeElement=input;
  const update=vi.fn();updateClaimCodeInput(input,update);expect(update).toHaveBeenCalledWith('BOB-7F3K');expect(input.setSelectionRange).toHaveBeenCalledWith(5,5);
  input.ownerDocument.activeElement=null;input.setSelectionRange.mockClear();updateClaimCodeInput(input,update);expect(input.setSelectionRange).not.toHaveBeenCalled();
 });
});
