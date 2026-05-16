import streamlit as st
import requests

API_BASE_URL = "http://localhost:8000"

st.set_page_config(page_title="MindMatch Interview Bot", layout="centered")

st.title("MindMatch Onboarding Interview")
st.write("This is a temporary frontend for testing the backend endpoints and generating initial profiles.")

# Initialize session state
if "session_id" not in st.session_state:
    st.session_state.session_id = None
    st.session_state.current_question = None
    st.session_state.messages = []
    st.session_state.interview_done = False
    st.session_state.chat_history_data = None
    st.session_state.profile_extracted = False

def start_interview():
    try:
        response = requests.post(f"{API_BASE_URL}/interview/start")
        if response.status_code == 200:
            data = response.json()
            st.session_state.session_id = data["session_id"]
            st.session_state.current_question = data["question"]
            st.session_state.messages.append({"role": "assistant", "content": data["question"]})
        else:
            st.error(f"Failed to start interview. Backend returned status code: {response.status_code}")
    except requests.exceptions.ConnectionError:
        st.error(f"Error connecting to backend. Is the backend running at {API_BASE_URL}?")
    except Exception as e:
        st.error(f"An unexpected error occurred: {e}")

if st.session_state.session_id is None:
    if st.button("Start Interview", type="primary"):
        start_interview()
        st.rerun()
else:
    # Display chat
    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    # Input chat message
    if not st.session_state.interview_done:
        user_input = st.chat_input("Type your answer here...")
        if user_input:
            st.session_state.messages.append({"role": "user", "content": user_input})
            with st.chat_message("user"):
                st.markdown(user_input)

            # Send to backend
            payload = {
                "session_id": st.session_state.session_id,
                "answer": user_input
            }
            try:
                with st.spinner("Analyzing..."):
                    res = requests.post(f"{API_BASE_URL}/interview/respond", json=payload)
                    
                if res.status_code == 200:
                    data = res.json()
                    status = data["status"]
                    
                    if status in ["retry", "clarify"]:
                        msg = data["message"]
                        st.session_state.messages.append({"role": "assistant", "content": msg})
                        with st.chat_message("assistant"):
                            st.markdown(msg)
                    
                    elif status == "next":
                        # Sometimes there's a fallback message or transition message
                        if data.get("message"):
                            st.session_state.messages.append({"role": "assistant", "content": data["message"]})
                            with st.chat_message("assistant"):
                                st.markdown(data["message"])
                        
                        next_q = data["question"]
                        st.session_state.current_question = next_q
                        st.session_state.messages.append({"role": "assistant", "content": next_q})
                        with st.chat_message("assistant"):
                            st.markdown(next_q)
                            
                    elif status == "done":
                        if data.get("message"):
                            st.session_state.messages.append({"role": "assistant", "content": data["message"]})
                            with st.chat_message("assistant"):
                                st.markdown(data["message"])
                                
                        st.session_state.interview_done = True
                        st.session_state.chat_history_data = data["chat_history"]
                        st.rerun()
                else:
                    st.error(f"Failed to submit answer. Code {res.status_code}: {res.text}")
            except requests.exceptions.ConnectionError:
                st.error("Lost connection to backend.")
            except Exception as e:
                st.error(f"An unexpected error occurred: {e}")

    # Once interview is complete, allow user to extract profile
    if st.session_state.interview_done and not st.session_state.profile_extracted:
        st.success("Interview completed! You can now extract the profile.")
        if st.button("Extract Profile & Save to DB", type="primary"):
            try:
                with st.spinner("Extracting profile (this may take a moment)..."):
                    res = requests.post(
                        f"{API_BASE_URL}/interview/extract-profile",
                        json={"chat_history": st.session_state.chat_history_data}
                    )
                if res.status_code == 200:
                    st.success("Profile successfully extracted and saved!")
                    st.json(res.json())
                    st.session_state.profile_extracted = True
                else:
                    st.error(f"Failed to extract profile. Code {res.status_code}: {res.text}")
            except requests.exceptions.ConnectionError:
                st.error("Lost connection to backend.")
            except Exception as e:
                st.error(f"An unexpected error occurred: {e}")

    # Option to restart
    if st.session_state.interview_done and st.session_state.profile_extracted:
        if st.button("Start New Interview"):
            for key in list(st.session_state.keys()):
                del st.session_state[key]
            st.rerun()
