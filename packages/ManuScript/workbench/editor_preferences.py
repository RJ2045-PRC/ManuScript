TOC_DEFAULTS=dict(enabled=True,side='left',maxDepth=6,collapseDepth=2,pinned=False,hover=False,tooltip=True,wrap=False,hideFirst=False,progress=True,barWidth=32)
LOGIC_STYLE_DEFAULT='symbols'
FIGURE_LABELS={'zh':'图','fig':'Fig.','figure':'Figure'}
FIGURE_LABEL_DEFAULT='zh'

def validate_figure_label(value):
    if not isinstance(value,str) or value not in FIGURE_LABELS:
        raise ValueError('图号样式请选择「图 1」「Fig. 1」或「Figure 1」')
    return value

def validate_logic_style(value):
    if not isinstance(value,str) or value not in ('symbols','visual'):
        raise ValueError('逻辑呈现请选择文字＋符号简图或文字＋可视简图')
    return value

def validate_toc(value):
    if not isinstance(value,dict) or set(value)-set(TOC_DEFAULTS):raise ValueError('无效的目录设置')
    result={**TOC_DEFAULTS,**value}
    for key,default in TOC_DEFAULTS.items():
        v=result[key]
        if type(v)!=type(default):raise ValueError('目录设置类型无效：'+key)
        if key=='side' and v not in ('left','right'):raise ValueError('目录位置无效')
        if key in ('maxDepth','collapseDepth') and not 1<=v<=6:raise ValueError('目录层级为 1–6')
        if key=='barWidth' and v not in (24,32,40,48):raise ValueError('目录短条长度无效')
    return result
