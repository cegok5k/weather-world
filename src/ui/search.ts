import { searchPlaces, type Place } from '../api/geocoding';

// Debounced type-ahead city search with keyboard navigation.
export function initSearch(onSelect: (place: Place) => void) {
  const input = document.getElementById('search-input') as HTMLInputElement;
  const list = document.getElementById('search-results') as HTMLUListElement;

  let results: Place[] = [];
  let highlighted = -1;
  let debounceId: number | undefined;
  let requestSeq = 0;

  function close() {
    list.hidden = true;
    list.innerHTML = '';
    results = [];
    highlighted = -1;
  }

  function render() {
    list.innerHTML = '';
    results.forEach((p, i) => {
      const li = document.createElement('li');
      li.textContent = p.label;
      li.className = i === highlighted ? 'highlighted' : '';
      // pointerdown preventDefault keeps the input focused so blur doesn't
      // close the list before the click lands; pick happens on click.
      li.addEventListener('pointerdown', (e) => e.preventDefault());
      li.addEventListener('click', () => pick(p));
      list.appendChild(li);
    });
    list.hidden = results.length === 0;
  }

  function pick(p: Place) {
    input.value = p.label;
    close();
    input.blur();
    onSelect(p);
  }

  input.addEventListener('input', () => {
    window.clearTimeout(debounceId);
    const q = input.value.trim();
    if (q.length < 2) {
      close();
      return;
    }
    debounceId = window.setTimeout(async () => {
      const seq = ++requestSeq;
      try {
        const found = await searchPlaces(q);
        if (seq !== requestSeq) return; // stale response
        results = found;
        highlighted = -1;
        render();
      } catch {
        close();
      }
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlighted = Math.min(highlighted + 1, results.length - 1);
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlighted = Math.max(highlighted - 1, 0);
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[highlighted >= 0 ? highlighted : 0]);
    } else if (e.key === 'Escape') {
      close();
    }
  });

  input.addEventListener('blur', () => {
    // Delay so pointerdown on a result fires first
    setTimeout(close, 150);
  });
}
