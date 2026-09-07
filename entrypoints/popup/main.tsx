import { render } from 'preact';
import './style.css';

function Popup() {
  return (
    <main>
      <p class="eyebrow">CALENDAR SYNC</p>
      <h1>Your academic calendar, kept current.</h1>
      <p class="muted">The Gradescope connector is being set up.</p>
    </main>
  );
}

render(<Popup />, document.getElementById('app')!);

