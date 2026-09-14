import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Route,Routes} from 'react-router-dom';
import AdminApp from './components/AdminApp';
import EmbedApp from './components/EmbedApp';
import './styles.css';
function App(){return <Routes><Route path="/embed/:slug" element={<EmbedApp/>}/><Route path="/admin/*" element={<AdminApp/>}/><Route path="*" element={<AdminApp/>}/></Routes>}
createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);
