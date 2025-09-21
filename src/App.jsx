import React, { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import NavBar from "./components/NavBar";
import './App.css';


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
    <div>
      <NavBar />
    </div>
  )
}

export default App
