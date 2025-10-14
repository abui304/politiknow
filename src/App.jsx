import React, { useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import NavBar from "./components/NavBar";
import Feed from './components/Feed';
import './App.css';
import Search from './pages/Search';


function HomePage() {
  return (
    <main className ="main-content">
      <Feed />
    </main>
  );
}

function App() {
  return (
    <Router>
      <NavBar />

      <Routes>
        <Route path="/home" element={<HomePage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<Search />} />
        <Route path="/profile" element={<h1>Profile Page</h1>} />
        <Route path="/settings" element={<h1>Settings Page</h1>} />
      </Routes>
    </Router>
  );
}

export default App
