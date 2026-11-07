import { speechLang } from '../i18n';

/**
 * Big, uppercase text box that types out letter by letter so a young reader
 * can follow along. "|" in a text starts a new page. 🔊 reads it aloud.
 */
export class Dialog {
  open = false;
  private pages: string[] = [];
  private full = '';
  private shown = 0;
  private timer = 0;
  private onClose?: () => void;
  private seen: HTMLSpanElement;
  private ghost: HTMLSpanElement;

  constructor(private box: HTMLElement, text: HTMLElement, speak: HTMLElement) {
    this.seen = document.createElement('span');
    this.ghost = document.createElement('span');
    this.ghost.className = 'ghost';
    text.replaceChildren(this.seen, this.ghost);
    box.addEventListener('pointerdown', e => { e.preventDefault(); this.advance(); });
    speak.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.speak(); });
    if (!('speechSynthesis' in window)) speak.hidden = true;
  }

  show(text: string, onClose?: () => void) {
    this.pages = text.split('|').map(s => s.trim()).filter(Boolean);
    this.onClose = onClose;
    this.open = true;
    this.box.hidden = false;
    this.nextPage();
  }

  private nextPage() {
    this.full = this.pages.shift() ?? '';
    this.shown = 0;
    this.box.classList.remove('done');
    this.render();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      this.shown++;
      this.render();
      if (this.shown >= this.full.length) this.finishPage();
    }, 55);
  }

  private finishPage() {
    clearInterval(this.timer);
    this.shown = this.full.length;
    this.render();
    this.box.classList.add('done');
  }

  private render() {
    this.seen.textContent = this.full.slice(0, this.shown);
    this.ghost.textContent = this.full.slice(this.shown);
  }

  advance() {
    if (!this.open) return;
    if (this.shown < this.full.length) return this.finishPage();
    if (this.pages.length) return this.nextPage();
    this.close();
  }

  close() {
    clearInterval(this.timer);
    this.open = false;
    this.box.hidden = true;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const cb = this.onClose;
    this.onClose = undefined;
    cb?.();
  }

  private speak() {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    // Lowercase so the voice reads words, not letters.
    const u = new SpeechSynthesisUtterance(this.full.toLocaleLowerCase(speechLang()));
    u.lang = speechLang();
    u.rate = 0.85;
    speechSynthesis.speak(u);
  }
}
