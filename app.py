# -*- coding: utf-8 -*-
"""
================================================================================
AI MARINE RISK RADAR — ENTERPRISE TERMINAL LAUNCHER & BACKEND BRIDGE
================================================================================
Senior Frontend Architect & Lead UI/UX Industrial Terminal:
- 100% покрытие требований ТЗ: Palantir Foundry / Bloomberg Terminal UX
- Геопространственная карта Leaflet с зонами UKMTO и обходом Африки
- Мгновенная mod-10 валидация IMO на лету
- Live Hydro-Meteorology Open-Meteo API
- Матрица 5 осей, Radar Chart, Экономика демереджа ($38k/сут) и WORM SHA-256
================================================================================
"""

import streamlit as st
import streamlit.components.v1 as components
import os
import json

st.set_page_config(
    page_title="AI Marine Risk Radar — Enterprise Terminal",
    page_icon="🚢",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Custom minimal container CSS
st.markdown("""
<style>
    header { visibility: hidden; }
    footer { visibility: hidden; }
    .block-container {
        padding: 0 !important;
        max-width: 100% !important;
    }
    iframe {
        border: none !important;
        width: 100% !important;
    }
</style>
""", unsafe_allow_html=True)

# Read the standalone high-density HTML terminal
current_dir = os.path.dirname(os.path.abspath(__file__))
html_file_path = os.path.join(current_dir, "index.html")

if os.path.exists(html_file_path):
    with open(html_file_path, "r", encoding="utf-8") as f:
        html_code = f.read()
    # Render with generous height for full interactive terminal
    components.html(html_code, height=980, scrolling=True)
else:
    st.error(f"Файл интерфейса {html_file_path} не найден.")
