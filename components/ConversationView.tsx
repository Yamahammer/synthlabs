import React, { useState } from 'react';
import { User, Bot, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { ChatMessage } from '../types';
import ReasoningHighlighter from './ReasoningHighlighter';

interface ConversationViewProps {
    messages: ChatMessage[];
}

// Helper to parse <think> tags from content
const parseThinkTags = (content: string): { reasoning: string | null; answer: string } => {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
        const reasoning = thinkMatch[1].trim();
        const answer = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
        return { reasoning, answer };
    }
    return { reasoning: null, answer: content };
};

const ConversationView: React.FC<ConversationViewProps> = ({ messages }) => {
    const [expandedReasoning, setExpandedReasoning] = useState<Set<number>>(new Set());

    const toggleReasoning = (index: number) => {
        setExpandedReasoning(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    if (!messages || messages.length === 0) {
        return (
            <div className="text-slate-500 text-sm italic p-4">
                No conversation messages.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {messages.map((msg, idx) => {
                // Parse <think> tags from content for display
                const { reasoning: embeddedReasoning, answer: cleanContent } = parseThinkTags(msg.content || '');
                // Use embedded reasoning if separate reasoning field is empty
                const displayReasoning = msg.reasoning || embeddedReasoning;
                const displayContent = cleanContent;

                return (
                    <div
                        key={idx}
                        className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                        {/* Avatar */}
                        <div
                            className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user'
                                ? 'bg-indigo-500/20 text-indigo-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                                }`}
                        >
                            {msg.role === 'user' ? (
                                <User className="w-4 h-4" />
                            ) : (
                                <Bot className="w-4 h-4" />
                            )}
                        </div>

                        {/* Message Bubble */}
                        <div
                            className={`flex-1 max-w-[85%] ${msg.role === 'user' ? 'text-right' : ''
                                }`}
                        >
                            <div
                                className={`inline-block rounded-xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                                    ? 'bg-indigo-600/30 text-indigo-100 border border-indigo-500/30'
                                    : 'bg-slate-800 text-slate-200 border border-slate-700'
                                    }`}
                            >
                                {/* Reasoning Toggle for Assistant Messages */}
                                {msg.role === 'assistant' && displayReasoning && (
                                    <div className="mt-2">
                                        <button
                                            onClick={() => toggleReasoning(idx)}
                                            className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-400 transition-colors uppercase font-bold tracking-wider"
                                        >
                                            <Sparkles className="w-3 h-3" />
                                            Reasoning Trace
                                            {expandedReasoning.has(idx) ? (
                                                <ChevronUp className="w-3 h-3" />
                                            ) : (
                                                <ChevronDown className="w-3 h-3" />
                                            )}
                                        </button>
                                        {expandedReasoning.has(idx) && (
                                            <div className="mt-2 bg-slate-900/50 border border-slate-800 rounded-lg p-3">
                                                <ReasoningHighlighter text={displayReasoning} />
                                            </div>
                                        )}
                                    </div>
                                )}
                                <p className="whitespace-pre-wrap">{displayContent}</p>
                            </div>



                            {/* Role Label */}
                            <div
                                className={`text-[9px] text-slate-600 uppercase font-bold mt-1 ${msg.role === 'user' ? 'text-right mr-1' : 'ml-1'
                                    }`}
                            >
                                {msg.role === 'user' ? 'User' : 'Assistant'}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ConversationView;
