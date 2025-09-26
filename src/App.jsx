import React, { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import NavBar from "./components/NavBar";
import './App.css';
import Feed from './components/Feed.jsx';


function MyButton() {
  return (
    <button>
      Press Me...
    </button>
  )
}

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="app-layout">
      <NavBar />
      <main className="main-content">
        <Feed />
      </main>
    </div>
  )
}

export default App
