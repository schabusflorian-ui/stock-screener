import { useWatchlist } from '../context/WatchlistContext';
import './WatchlistButton.css';

function WatchlistButton({ symbol, name, sector, size = 'medium' }) {
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const inWatchlist = isInWatchlist(symbol);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inWatchlist) {
      removeFromWatchlist(symbol);
    } else {
      addToWatchlist(symbol, name, sector);
    }
  };

  return (
    <button
      className={`watchlist-btn ${size} ${inWatchlist ? 'active' : ''}`}
      onClick={handleClick}
      title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
    >
      <span className="star">{inWatchlist ? '★' : '☆'}</span>
      {size !== 'small' && (
        <span className="label">{inWatchlist ? 'Watching' : 'Watch'}</span>
      )}
    </button>
  );
}

export default WatchlistButton;
