// In your main App.jsx
import AdvancedTrading from 'AdvancedTrading';

function App() {
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  return (
    <div className="App">
      {/* Your existing Recent Scans section */}
      
      <button onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? 'Hide Advanced Trading' : 'Show Advanced Trading'}
      </button>
      
      {showAdvanced && <AdvancedTrading />}
    </div>
  );
}
