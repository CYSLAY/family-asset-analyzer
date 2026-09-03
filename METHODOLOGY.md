# 分析口径与边界

本工具的“结构健康度”用于帮助整理家庭资产负债表、现金流与目标缺口，不是信用评分、投资评级、贷款审批结论或个性化理财建议。

## 数据口径

- 收入与支出按录入频率统一换算为年度金额。
- 年度结余 = 年收入 − 年支出 − 年度债务还款。
- 应急资金只包含被标记为“可用于应急”且不是长期锁定的资产。
- 必要月度流出包含必要生活支出和债务月供。
- 教育费用由用户输入的当前费用、年限和通胀假设推算，系统不预设某个城市或学校价格。

## 动态区间

- 应急储备以 6 个月为基准；单一收入来源、收入波动或存在子女/父母责任时，提高到最高 12 个月。FDIC 的消费者教育材料提到，专家通常建议至少准备约 6 个月生活费用；CFPB 同时强调金额应取决于个人情况。
- 债务偿付占收入使用 20%、36% 和 50% 作为产品提醒线。CFPB 对 DTI 的定义是“每月债务还款 ÷ 月度税前收入”，并明确不同贷款产品和机构会使用不同上限，因此本工具不会把 36% 显示成统一审批标准。
- 储蓄率、资产负债率、固定资产占比和教育准备度的分段是产品启发式，用来触发不同解释和行动优先级，不代表监管或行业统一标准。
- 保险支出占比只评估年度保费对家庭收入的现金流负担，不代表保障是否充足，也不参与综合健康评分。0%-10%为负担相对温和的产品提示区间，10%-20%需结合年度结余、负债及应急资金检查，超过20%重点提示长期缴费压力。
- 上述分档不是统一行业合格线：0%不作好坏判断，10%计入需关注档，20%仍在需关注档。20%法规参考来自《金融机构产品适当性管理办法》第39条，适用对象为分红型、万能型、投资连结型、变额型等利益不确定的人身保险销售，触发的是投保声明签名确认，不是禁售线，也不能直接套用为全部保费合计或香港保单的监管标准。现金流工具中的假设购买储蓄险不计入实际保费。
- 任何“紧急”指标都会把总分上限压到 49，避免其他高分掩盖净资产为负、短期偿债不足或现金流赤字。

## 公开参考

- [FDIC：Saving for the Unexpected and Your Future](https://www.fdic.gov/consumer-resource-center/2025-01/saving-unexpected-and-your-future)
- [CFPB：An essential guide to building an emergency fund](https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/)
- [CFPB：What is a debt-to-income ratio?](https://www.consumerfinance.gov/ask-cfpb/what-is-a-debt-to-income-ratio-en-1791/)
- [Investor.gov：Introduction to Investing](https://www.investor.gov/introduction-investing)
- [国家金融监督管理总局、司法部：金融机构产品适当性管理办法](https://www.moj.gov.cn/pub/sfbgw/flfggz/flfggzbmgz/202510/t20251021_526569.html)
- [香港保险业监管局：投保注意事项](https://education.ia.org.hk/sc/faq.html)

最后校准日期：2026-08-12。
