import logging
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI

logger = logging.getLogger(__name__)

class WebSearchRouter(BaseModel):
    web_search_required: bool = Field(description="True if external web retrieval is required for current events, fresh documentation, recent news, or timely facts.")
    reason: str = Field(description="Short reason explaining why search is or is not required.")

_router_model = ChatOpenAI(model="gpt-4o-mini", temperature=0.0).with_structured_output(WebSearchRouter)

def route_query(query: str) -> bool:
    """
    Use a lightweight LLM call to determine if the query requires external web search.
    """
    try:
        prompt = (
    "Determine whether the user's query requires external web search.\n"
    "Respond ONLY with True or False.\n"
    "Respond True ONLY if the query requires:\n"
    "- recent or real-time information\n"
    "- current events or news\n"
    "- up-to-date documentation, APIs, libraries, or software changes\n"
    "- live data, prices, releases, or rapidly changing factual information\n\n"
    "Respond False for:\n"
    "- conversational or reflective discussions\n"
    "- personal advice or behavioral reasoning\n"
    "- conceptual explanations\n"
    "- opinion-based discussions\n"
    "- questions answerable using general knowledge without current web information\n\n"
    
    f"Query: {query}"
)
        result = _router_model.invoke(prompt)
        print(f"\n[WEB SEARCH ROUTER] Required: {result.web_search_required} | Reason: {result.reason}\n")
        logger.info(f"WebSearchRouter: required={result.web_search_required}, reason={result.reason}")
        return result.web_search_required
    except Exception as e:
        print(f"\n[WEB SEARCH ROUTER ERROR] {e}\n")
        logger.error(f"Error in web search routing: {e}")
        return False

def perform_web_search(query: str, max_results: int = 3) -> list[dict]:
    """
    Perform a lightweight web search using duckduckgo_search.
    Returns a list of concise snippets.
    """
    try:
        from duckduckgo_search import DDGS
        
        print(f"\n[WEB SEARCH] Searching DuckDuckGo for: '{query}'\n")
        logger.info(f"Performing web search for: '{query}'")
        
        # DDGS sometimes needs to be instantiated or used as a context manager depending on the version
        # We will wrap it to catch any iteration issues
        snippets = []
        with DDGS() as ddgs:
            results = ddgs.text(query, max_results=max_results)
            if results:
                for r in results:
                    snippets.append({
                        "title": r.get("title", ""),
                        "snippet": r.get("body", ""),
                        "url": r.get("href", "")
                    })
            
        print(f"\n[WEB SEARCH] Found {len(snippets)} snippets\n")
        return snippets
    except ImportError:
        print("\n[WEB SEARCH ERROR] ddgs is not installed! Run: pip install ddgs\n")
        logger.error("ddgs is not installed. Please run 'pip install ddgs'.")
        return []
    except Exception as e:
        print(f"\n[WEB SEARCH ERROR] Failed to fetch search results: {e}\n")
        logger.error(f"Error performing web search: {e}")
        return []
