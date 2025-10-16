import React, { useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import NavBar from "./components/NavBar";
import Feed from './components/Feed';
import './App.css';
import Search from './pages/Search';
import Profile from './pages/Profile';
import Settings from './pages/Settings';


function HomePage() {
  return (
    <Feed />
  );
}

function App() {
  return (
    <Router>
      <NavBar />
      <main className ="main-content">
        <Routes>
          <Route path="/home" element={<HomePage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<Search />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App
